import { CompiledInstruction, ConfirmedTransaction, InnerInstructions } from "@triton-one/yellowstone-grpc/dist/grpc/solana-storage";
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
import { SolanaManager } from "../services/solana/SolanaManager";
import { TokenBalance } from "@solana/web3.js";
import { BN } from "bn.js";
import { kSolAddress } from "../services/solana/Constants";

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
            const instructions = [...transaction.message.instructions, ...meta.innerInstructions.map((i: InnerInstructions) => i.instructions).flat()];
            
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

    //             for (const item of [...transaction.message.instructions, ...meta.innerInstructions.map((i: any) => i.instructions).flat()]) {
    //                 if (accounts[item.programIdIndex] !== kProgramIdRaydium) continue
                
    //                 if ([...(item.data as Buffer).values()][0] != 1) continue
                
    //                 const keyIndex = [...(item.accounts as Buffer).values()]

    //                 const expectedPoolId = accounts[keyIndex[4]];
    //                 console.log(new Date(), process.env.SERVER_NAME, 'processParsedTransaction', signature, 'keyIndex[4]:', keyIndex[4], 'expectedPoolId:', expectedPoolId);
    //                 poolId = expectedPoolId;
    //             }


            // if (instructions){
            //     for (const instruction of instructions) {
            //         const programId = accounts[instruction.programIdIndex];
            //         const ix = this.compiledInstructionToBase58(instruction);
            //         console.log('programId:', programId, 'ix:', ix);

            //         const parsed = await ProgramManager.parseIx(programId, ix);
            //         console.log('parsed:', parsed);
            //     }
            // }

            await this.processTxForChats(signature, chats);            
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

    static async processTxForChats(signature: string, chats: {id: number, wallets: IWallet[]}[]){
        try {
            const connection = newConnection();
            const tx = await SolanaManager.getParsedTransaction(connection, signature);

            if (!tx || !tx.meta){
                console.error('MigrationManager', 'migrate', 'tx not found', signature);
                return;
            }

            // const instructions = [];

            for (const chat of chats) {
                let message = `[<a href="${ExplorerManager.getUrlToTransaction(signature)}">TX</a>]\n\n`;
    
                let accountIndex = 0;
                for (const account of tx.transaction.message.accountKeys) {
                    const wallet = chat.wallets.find((w) => w.walletAddress == account.pubkey.toBase58());
                    if (wallet){
                        const walletTitle = wallet.title || wallet.walletAddress;
                        message += `🏦 <a href="${ExplorerManager.getUrlToAddress(wallet.walletAddress)}">${walletTitle}</a>\n`;
    
                        const tokenBalances: { accountIndex: number, mint?: string, balanceChange: number, pre: TokenBalance | undefined, post: TokenBalance | undefined }[] = [];
    
                        if (tx.meta.preTokenBalances || tx.meta.postTokenBalances){
                            const accountIndexes: number[] = [];
                            //     ...(tx.meta.preTokenBalances ? tx.meta.preTokenBalances.filter((b) => b.owner == account.pubkey.toBase58()) : []),
                            //     ...(tx.meta.postTokenBalances ? tx.meta.postTokenBalances.filter((b) => b.owner == account.pubkey.toBase58()) : [])
                            // ]
    
                            if (tx.meta.preTokenBalances){
                                for (const preTokenBalance of tx.meta.preTokenBalances) {
                                    if (preTokenBalance.owner == account.pubkey.toBase58() && !accountIndexes.includes(preTokenBalance.accountIndex)){
                                        accountIndexes.push(preTokenBalance.accountIndex);
                                    }
                                }
                            }
                            if (tx.meta.postTokenBalances){
                                for (const postTokenBalance of tx.meta.postTokenBalances) {
                                    if (postTokenBalance.owner == account.pubkey.toBase58() && !accountIndexes.includes(postTokenBalance.accountIndex)){
                                        accountIndexes.push(postTokenBalance.accountIndex);
                                    }
                                }
                            }
    
                            for (const accountIndex of accountIndexes){
                                const preTokenBalance = tx.meta.preTokenBalances?.find((b) => b.accountIndex == accountIndex);
                                const postTokenBalance = tx.meta.postTokenBalances?.find((b) => b.accountIndex == accountIndex);
                                const mint = preTokenBalance?.mint || postTokenBalance?.mint || undefined;
    
                                const preBalance = new BN(preTokenBalance?.uiTokenAmount.amount || 0);
                                const postBalance = new BN(postTokenBalance?.uiTokenAmount.amount || 0);
                                const balanceDiff = postBalance.sub(preBalance);
                                const lamportsPerToken = 10 ** (preTokenBalance?.uiTokenAmount.decimals ||postTokenBalance?.uiTokenAmount.decimals || 0);
                                const { div, mod } = balanceDiff.divmod(new BN(lamportsPerToken));
                                const balanceChange = div.toNumber() + mod.toNumber() / lamportsPerToken;
    
    
                                tokenBalances.push({ accountIndex, mint, balanceChange, pre: preTokenBalance, post: postTokenBalance });
                            }
                        }
    
                        const nativeBalanceChange = tx.meta.postBalances[accountIndex] - tx.meta.preBalances[accountIndex];
                        const wsolBalanceChange = tokenBalances.find((b) => b.mint == kSolAddress)?.balanceChange || 0;                    
                        const nativeBalanceChangeInSol = nativeBalanceChange / web3.LAMPORTS_PER_SOL + wsolBalanceChange;
                        console.log('nativeBalanceChange:', nativeBalanceChange, 'wsolBalanceChange:', wsolBalanceChange, 'nativeBalanceChangeInSol:', nativeBalanceChangeInSol);
                        if (nativeBalanceChangeInSol){

                            message += `SOL: ${nativeBalanceChangeInSol>0?'+':''}${Helpers.prettyNumber(nativeBalanceChangeInSol, 2)}\n`;
                        }
    
                        for (const tokenBalance of tokenBalances) {
                            const mint = tokenBalance.pre?.mint || tokenBalance.post?.mint || undefined;
                            if (mint && mint != kSolAddress){
                                const balanceChange = tokenBalance.balanceChange;
                                const tokenName = Helpers.prettyWallet(mint);
                                message += `<a href="${ExplorerManager.getUrlToAddress(mint)}">${tokenName}</a>: ${balanceChange>0?'+':''}${Helpers.prettyNumber(balanceChange, 2)}\n`;            
                            }
                        }
    
                    }
                    accountIndex++;
                }
    
                //TODO: add SOL & token prices in USD
                //TODO: add info about token and BUY/SELL buttons
    
                if (process.env.ENVIRONMENT == 'PRODUCTION'){
                    BotManager.sendMessage(chat.id, message);
                }
                else {
                    console.log(message);
                }
            }
        }
        catch (err) {
            console.error(new Date(), 'MigrationManager', 'processTxForChats', 'Error:', err);
        }

    }

}