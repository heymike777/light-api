import { ConfirmedTransaction } from "@triton-one/yellowstone-grpc/dist/grpc/solana-storage";
import { IWallet, Wallet } from "../entities/Wallet";
import base58 from "bs58";
import { BotManager } from "./bot/BotManager";

export class WalletManager {

    static walletsMap: Map<string, IWallet[]> = new Map();

    static async addWallet(chatId: number, walletAddress: string, title?: string){
        const existingWallet = await Wallet.findOne({chatId: chatId, walletAddress: walletAddress});
        if (existingWallet){
            existingWallet.title = title;
            await existingWallet.save();

            // Update cache
            const tmpWallets = this.walletsMap.get(walletAddress);
            if (tmpWallets){
                for (let wallet of tmpWallets){
                    if (wallet.chatId == chatId){
                        wallet.title = title;
                        break;
                    }
                }
            }
        }
        else {
            const wallet = new Wallet({
                chatId: chatId,
                walletAddress: walletAddress,
                title: title,
                isVerified: false,
                createdAt: new Date()
            });
            await wallet.save();

            // Update cache
            let tmpWallets = this.walletsMap.get(walletAddress);
            if (tmpWallets){
                tmpWallets.push(wallet);
            }
            else {
                tmpWallets = [wallet];
            }
        }
    }

    static async removeWallets(chatId: number, walletAddresses: string[]){
        await Wallet.deleteMany({chatId: chatId, walletAddress: {$in: walletAddresses}});

        // Remove from cache
        for (let walletAddress of walletAddresses){
            const tmpWallets = this.walletsMap.get(walletAddress);
            if (tmpWallets){
                const newWallets = tmpWallets.filter((wallet) => wallet.chatId != chatId);
                if (newWallets.length == 0){
                    this.walletsMap.delete(walletAddress);
                }
                else {
                    this.walletsMap.set(walletAddress, newWallets);
                }
            }
        }
    }

    static async fetchWalletsByChatId(chatId: number): Promise<IWallet[]> {
        return Wallet.find({chatId: chatId});
    }

    static async fetchAllWalletAddresses() {
        const wallets = await Wallet.find();
        this.walletsMap.clear();
        for (let wallet of wallets){
            if (this.walletsMap.has(wallet.walletAddress)){
                this.walletsMap.get(wallet.walletAddress)?.push(wallet);
            }
            else {
                this.walletsMap.set(wallet.walletAddress, [wallet]);
            }
        }
    }

    static async processWalletTransaction(signature: string, parsedTransaction: ConfirmedTransaction, logs: boolean = false) {
        try {
            const transaction = parsedTransaction.transaction;
            const meta = parsedTransaction.meta

            if (!transaction || !meta || !transaction.message){
                return;
            }

            const accounts = transaction.message.accountKeys.map((i: Uint8Array) => base58.encode(i));
            const logMessages: string[] = meta.logMessages;
            
            const wallets: IWallet[] = [];
            for (const walletInvolved of accounts) {
                const tmpWallets = this.walletsMap.get(walletInvolved);
                if (tmpWallets){
                    wallets.push(...tmpWallets);
                }
            }

            // console.log(new Date(), process.env.SERVER_NAME, 'processWalletTransaction', signature, 'accounts:', accounts, 'logMessages:', logMessages);

            const chats: {id: number, wallets: IWallet[]}[] = [];
            for (let wallet of wallets){
                if (wallet.chatId){
                    const chat = chats.find((c) => c.id == wallet.chatId);
                    if (chat){
                        chat.wallets.push(wallet);
                    }
                    else {
                        chats.push({id: wallet.chatId, wallets: [wallet]});
                    }
                }
            }
            
            for (let chat of chats){
                let message = `[<a href="https://solscan.io/tx/${signature}">NEW TRANSACTION</a>]\n\n`;

                message += `Wallets:\n`;
                for (const wallet of chat.wallets) {
                    const walletTitle = wallet.title || wallet.walletAddress;
                    message += `<a href="https://solscan.io/account/${wallet.walletAddress}">${walletTitle}</a>\n`;                    
                }
                // message += `Transaction: <a href="https://solscan.io/tx/${signature}">${signature}</a>`;

                BotManager.sendMessage(wallet.chatId, message);
            }
            
        }
        catch (err) {
            if (logs) console.error(new Date(), 'processWalletTransaction', 'Error:', err);
        }
    }

}