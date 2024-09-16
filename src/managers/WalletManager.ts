import { CompiledInstruction, ConfirmedTransaction } from "@triton-one/yellowstone-grpc/dist/grpc/solana-storage";
import { IWallet, Wallet } from "../entities/Wallet";
import base58 from "bs58";
import { BotManager } from "./bot/BotManager";
import { ProgramManager } from "./ProgramManager";
import * as web3 from '@solana/web3.js';
import { newConnection } from "../services/solana/lib/solana";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { ExplorerManager } from "../services/explorers/ExplorerManager";
import { HeliusManager } from "../services/solana/HeliusManager";
import { Helpers } from "../services/helpers/Helpers";
import { EnrichedTransaction } from "helius-sdk";

export class WalletManager {

    static walletsMap: Map<string, IWallet[]> = new Map();
    static programIds: string[] = [];

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
            const instructions = transaction.message.instructions;
            const logMessages: string[] = meta.logMessages;
            
            for (const instruction of instructions) {
                const programId = accounts[instruction.programIdIndex];
                ProgramManager.addProgram(programId);
            }

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

            if (chats.length == 0){
                return;
            }

            if (instructions){
                for (const instruction of instructions) {
                    const programId = accounts[instruction.programIdIndex];
                    const ix = this.compiledInstructionToBase58(instruction);
                    console.log('programId:', programId, 'ix:', ix);

                    const parsed = await ProgramManager.parseIx(programId, ix);
                    console.log('parsed:', parsed);
                }
            }

            // const connection = newConnection();
            // const tx = await connection.getParsedTransaction(signature, {commitment: 'confirmed'});
            // console.log('tx:', JSON.stringify(tx, null, 2));
            
            // console.log('parsedTransaction:', JSON.stringify(parsedTransaction, null, 2));

            let tries = 3;
            let tx: EnrichedTransaction | undefined = undefined;
            while (!tx && tries > 0){                
                await Helpers.sleep(0.5);
                tx = await HeliusManager.getTransaction(signature);
                console.log('!tx:', tx);
                tries--;
            }

            for (let chat of chats){
                let message = `[<a href="${ExplorerManager.getUrlToTransaction(signature)}">${tx.type}</a> on ${tx.source}]\n\n`;

                let description = tx.description;
                if (description && description != ''){
                    for (const wallet of chat.wallets) {
                        const walletTitle = wallet.title || wallet.walletAddress;
                        if (description.includes(wallet.walletAddress)) {
                            description = description.replace(wallet.walletAddress, `<a href="${ExplorerManager.getUrlToAddress(wallet.walletAddress)}">${walletTitle}</a>`);
                        }
                    }
        
                    if (description != ''){
                        message += `${description}\n\n`;
                    }
                }

                for (const account of tx.accountData) {
                    const wallet = chat.wallets.find((w) => w.walletAddress == account.account);
                    if (wallet){
                        const walletTitle = wallet.title || wallet.walletAddress;
                        message += `<a href="${ExplorerManager.getUrlToAddress(wallet.walletAddress)}">${walletTitle}</a>:\n`;
                        if (account.nativeBalanceChange != 0){
                            message += `SOL: ${Helpers.prettyNumber(account.nativeBalanceChange / web3.LAMPORTS_PER_SOL, 3)}\n`;
                        }
                        // if (account.tokenBalanceChanges){
                        //     for (const balanceChange of account.tokenBalanceChanges) {
                        //         const amount = new BN(balanceChange.rawTokenAmount.tokenAmount);
                        //         message += `${balanceChange.mint}: ${amount.div(new BN(10 ** balanceChange.rawTokenAmount.decimals))}\n`;
                        //     }    
                        // }
                    }
                    
                }

                //TODO: add info about token and BUY/SELL buttons

                BotManager.sendMessage(chat.id, message);
            }
            
        }
        catch (err) {
            if (logs) console.error(new Date(), 'processWalletTransaction', 'Error:', err);
        }
    }

    /**
     * Serializes a number into a compact-u16 format used by Solana.
     * @param value The number to serialize.
     * @returns An array of bytes representing the compact-u16 encoded number.
     */
    static serializeCompactU16(value: number): number[] {
        const bytes = [];
        let remaining = value;
    
        do {
        let byte = remaining & 0x7F;
        remaining >>= 7;
        if (remaining !== 0) {
            byte |= 0x80;
        }
        bytes.push(byte);
        } while (remaining !== 0);
    
        return bytes;
    }
    
    /**
     * Converts a CompiledInstruction into a base58 encoded string.
     * @param instruction The CompiledInstruction to convert.
     * @returns A base58 encoded string of the serialized instruction.
     */
    static compiledInstructionToBase58(instruction: CompiledInstruction): string {
        const { programIdIndex, accounts, data } = instruction;
    
        const buffer = [];
    
        // Append programIdIndex (1 byte)
        buffer.push(programIdIndex);
    
        // Append accounts length (compact-u16)
        buffer.push(...this.serializeCompactU16(accounts.length));
    
        // Append account indices (each as a single byte)
        buffer.push(...accounts);
    
        // Append data length (compact-u16)
        buffer.push(...this.serializeCompactU16(data.length));
    
        // Append data bytes
        buffer.push(...data);
    
        // Convert buffer to Uint8Array
        const byteArray = Uint8Array.from(buffer);
    
        // Base58 encode the serialized instruction
        return bs58.encode(byteArray);
    }

}