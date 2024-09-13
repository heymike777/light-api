import { ConfirmedTransaction } from "@triton-one/yellowstone-grpc/dist/grpc/solana-storage";
import { IWallet, Wallet } from "../entities/Wallet";
import base58 from "bs58";
import { BotManager } from "./bot/BotManager";

export class WalletManager {

    static async addWallet(chatId: number, walletAddress: string, title?: string){
        const existingWallet = await Wallet.findOne({chatId: chatId, walletAddress: walletAddress});
        if (existingWallet){
            existingWallet.title = title;
            await existingWallet.save();
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
        }
    }

    static async removeWallets(chatId: number, walletAddresses: string[]){
        await Wallet.deleteMany({chatId: chatId, walletAddress: {$in: walletAddresses}});
    }

    static async getWalletsByChatId(chatId: number): Promise<IWallet[]> {
        return Wallet.find({chatId: chatId});
    }

    static async getAllWalletAddresses(): Promise<string[]> {
        const wallets = await Wallet.find();
        const walletAddresses: string[] = [];

        for (let wallet of wallets){
            if (walletAddresses.includes(wallet.walletAddress) == false){
                walletAddresses.push(wallet.walletAddress);
            }
        }

        return walletAddresses;
    }

    static async processWalletTransaction(signature: string, parsedTransaction: ConfirmedTransaction, logs: boolean = false) {
        try {
            const transaction = parsedTransaction.transaction;
            const meta = parsedTransaction.meta

            if (!transaction || !meta || !transaction.message){
                return;
            }
        
            const logMessages: string[] = meta.logMessages;
            const accounts = transaction.message.accountKeys.map((i: Uint8Array) => base58.encode(i))
            const signer = base58.encode(transaction.message.accountKeys[0]);

            console.log(new Date(), process.env.SERVER_NAME, 'processWalletTransaction', signature, 'signer:', signer, 'accounts:', accounts, 'logMessages:', logMessages);

            const wallets = await Wallet.find({walletAddress: {$in: accounts}});
            for (let wallet of wallets){
                if (wallet.chatId){
                    // const user = await
                    const walletTitle = wallet.title ? wallet.title : wallet.walletAddress;
                    let message = '';
                    message += `[<a href="https://solscan.io/account/${wallet.walletAddress}">${walletTitle}</a>]\n\n`;
                    message += `Transaction: <a href="https://solscan.io/tx/${signature}">${signature}</a>`;

                    BotManager.sendMessage(wallet.chatId, message);
                }
            }
            
        }
        catch (err) {
            if (logs) console.error(new Date(), 'processWalletTransaction', 'Error:', err);
        }
    }


}