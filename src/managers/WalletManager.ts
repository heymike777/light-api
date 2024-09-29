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
import { Token, TokenManager, TokenNft, TokenNftAttribute } from "./TokenManager";
import { kMinSolChange } from "../services/Constants";
import { ParsedTransactionWithMeta } from "@solana/web3.js";
import { Chain } from "../services/solana/types";
import { MetaplexManager } from "./MetaplexManager";

export class WalletManager {

    static walletsMap: Map<string, IWallet[]> = new Map();
    static programIds: string[] = [];

    static async addWallet(chatId: number, userId: string, walletAddress: string, title?: string){
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
                userId: userId,
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

    static kBatchSize = 50;
    static signaturesQueue: string[] = [];
    static async processWalletTransaction(signature: string) {
        this.signaturesQueue.push(signature);
        if (this.signaturesQueue.length >= this.kBatchSize){
            this.processTransactionsBatch();
        }
    }

    static async processTransactionsBatch(){
        const signatures = this.signaturesQueue.splice(0, this.signaturesQueue.length);
        // console.log(new Date(), 'processTransactionsBatch', 'signatures', signatures.length, signatures);

        try {
            const connection = newConnection();
            const txs = await SolanaManager.getParsedTransactions(connection, signatures);
            for (const tx of txs){
                try{
                    const signature = tx.transaction.signatures[0];
                    if (!tx.transaction || !tx.meta){
                        console.error(new Date(), 'processWalletTransaction', 'tx not found', signature);
                        continue;
                    }

                    const walletsInvolved = this.getInvolvedWallets(tx);

                    const wallets: IWallet[] = [];
                    for (const walletInvolved of walletsInvolved) {
                        const tmpWallets = this.walletsMap.get(walletInvolved);
                        if (tmpWallets){
                            wallets.push(...tmpWallets);
                        }
                    }

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
                        continue;
                    }

                    await this.processTxForChats(signature, tx, chats);   
                }
                catch (err) {
                    console.error(new Date(), 'processWalletTransaction1', 'Error:', err);
                }
            }         
        }
        catch (err) {
            console.error(new Date(), 'processWalletTransaction2', 'Error:', err);
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

    static async processTxForChats(signature: string, tx: ParsedTransactionWithMeta, chats: {id: number, wallets: IWallet[]}[]){
        try {
            if (!tx.meta){
                console.error('MigrationManager', 'migrate', 'tx not found', signature);
                return;
            }

            const walletsInvolved = this.getInvolvedWallets(tx);

            const parsedTx = await ProgramManager.parseTx(tx);
            let asset: TokenNft | undefined = undefined;
            
            if (parsedTx.assetId){
                asset = await MetaplexManager.fetchAssetAndParseToTokenNft(parsedTx.assetId);
                console.log('!asset', asset);
            }

            for (const chat of chats) {
                let hasWalletsChanges = false;
                let message = `[${parsedTx.title}]\n`;

                if (parsedTx.description){
                    message += '\n' + parsedTx.description.html + '\n';
                }

                if (asset){
                    hasWalletsChanges = true;
                }
    
                let accountIndex = 0;
                for (const walletInvolved of walletsInvolved) {
                    const wallet = chat.wallets.find((w) => w.walletAddress === walletInvolved);
                    if (wallet){
                        let blockMessage = '';
                        const walletTitle = wallet.title || wallet.walletAddress;
                        blockMessage += `\n🏦 <a href="${ExplorerManager.getUrlToAddress(wallet.walletAddress)}">${walletTitle}</a>`;
    
                        const tokenBalances: { accountIndex: number, mint?: string, balanceChange: number, pre: TokenBalance | undefined, post: TokenBalance | undefined }[] = [];
    
                        if (tx.meta.preTokenBalances || tx.meta.postTokenBalances){
                            const accountIndexes: number[] = [];
    
                            if (tx.meta.preTokenBalances){
                                for (const preTokenBalance of tx.meta.preTokenBalances) {
                                    if (preTokenBalance.owner == walletInvolved && !accountIndexes.includes(preTokenBalance.accountIndex)){
                                        accountIndexes.push(preTokenBalance.accountIndex);
                                    }
                                }
                            }
                            if (tx.meta.postTokenBalances){
                                for (const postTokenBalance of tx.meta.postTokenBalances) {
                                    if (postTokenBalance.owner == walletInvolved && !accountIndexes.includes(postTokenBalance.accountIndex)){
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
    
                        let hasBalanceChange = false;
                        const nativeBalanceChange = tx.meta.postBalances[accountIndex] - tx.meta.preBalances[accountIndex];
                        const wsolBalanceChange = tokenBalances.find((b) => b.mint == kSolAddress)?.balanceChange || 0;                    
                        const balanceChange = nativeBalanceChange / web3.LAMPORTS_PER_SOL + wsolBalanceChange;
                        if (balanceChange && Math.abs(balanceChange) >= kMinSolChange){
                            hasBalanceChange = true;
                            hasWalletsChanges = true;
                            const token = await TokenManager.getToken(kSolAddress);
                            const tokenValueString = token && token.price ? '(' + (balanceChange<0?'-':'') + '$'+Math.round(Math.abs(balanceChange) * token.price * 100)/100 + ')' : '';
                            blockMessage += `\nSOL: ${balanceChange>0?'+':''}${Helpers.prettyNumber(balanceChange, 2)} ${tokenValueString}`;
                        }
    
                        for (const tokenBalance of tokenBalances) {
                            const mint = tokenBalance.pre?.mint || tokenBalance.post?.mint || undefined;
                            if (mint && mint != kSolAddress){
                                hasBalanceChange = true;
                                hasWalletsChanges = true;
                                const token = await TokenManager.getToken(mint);
                                if (token?.nft && !asset){
                                    asset = token.nft;
                                }
                                const balanceChange = tokenBalance.balanceChange;
                                const tokenValueString = token && token.price ? '(' + (balanceChange<0?'-':'') + '$'+Math.round(Math.abs(balanceChange) * token.price * 100)/100 + ')' : '';
                                const tokenName = token && token.symbol ? token.symbol : Helpers.prettyWallet(mint);
                                blockMessage += `\n<a href="${ExplorerManager.getUrlToAddress(mint)}">${tokenName}</a>: ${balanceChange>0?'+':''}${Helpers.prettyNumber(balanceChange, 2)} ${tokenValueString}`;            
                            }
                        }

                        if (hasBalanceChange){
                            message += blockMessage;
                        }
                    }
                    accountIndex++;
                }

                if (!asset){
                    // Try to find asset from list of balances

                    const balances = [
                        ...tx.meta.preTokenBalances || [],
                        ...tx.meta.postTokenBalances || [],
                    ];

                    const uniqueMints: string[] = [];
                    for (const balance of balances){
                        if (balance.mint && balance.owner){
                            const wallet = chat.wallets.find((w) => w.walletAddress === balance.owner);
                            if (!wallet){
                                if (!uniqueMints.includes(balance.mint)){
                                    uniqueMints.push(balance.mint);
                                }
                            }
                        }
                    }

                    const uniqueNftMints: string[] = [];
                    for (const mint of uniqueMints) {
                        const preTokenBalance = tx.meta.preTokenBalances?.find((b) => b.mint == mint);
                        const postTokenBalance = tx.meta.postTokenBalances?.find((b) => b.mint == mint);

                        if (mint == '26WzjUcXtyR2f4Uob7orpusxWgAg7Bycu46LQCmutWa5'){
                            console.log('!mike1', 'preTokenBalance', preTokenBalance, 'postTokenBalance', postTokenBalance);
                        }

                        if (preTokenBalance && postTokenBalance){
                            if (
                                (preTokenBalance.uiTokenAmount.amount == '0' || preTokenBalance.uiTokenAmount.amount == '1')
                                && (postTokenBalance.uiTokenAmount.amount == '0' || postTokenBalance.uiTokenAmount.amount == '1')
                            ){
                                uniqueNftMints.push(mint);
                            }
                        }
                    }

                    console.log('!mike1', 'uniqueMints', uniqueMints, 'uniqueNftMints', uniqueNftMints);
                    for (const mint of uniqueNftMints) {
                        asset = await MetaplexManager.fetchAssetAndParseToTokenNft(mint);
                        if (asset){
                            console.log('!mike2', 'asset', asset);
                            break;
                        }
                    }
                }

                if (asset){
                    message += `\n${asset.title} | <a href="https://www.tensor.trade/item/${asset.id}">Tensor</a>`;

                    if (asset.attributes && asset.attributes.length > 0){
                        message += `\n\n<b>Attributes:</b>`;
                        message += `${asset.attributes.map((a) => '- ' + a.trait_type + ': ' + a.value).join('\n')}`;
                    }

                    message += '\n';
                }

                message += `\n<a href="${ExplorerManager.getUrlToTransaction(signature)}">Explorer</a>`;

                if (hasWalletsChanges){
                    BotManager.sendMessage({ 
                        chatId: chat.id, 
                        text: message, 
                        imageUrl: asset?.image 
                    });
                }
            }
        }
        catch (err) {
            console.error(new Date(), 'MigrationManager', 'processTxForChats', 'Error:', err);
        }

    }

    static getInvolvedWallets(tx: ParsedTransactionWithMeta): string[] {
        const wallets: string[] = [];
        for (const account of tx.transaction.message.accountKeys) {
            wallets.push(account.pubkey.toBase58());
        }
        if (tx.meta?.preTokenBalances){
            for (const account of tx.meta.preTokenBalances) {
                if (account.owner && !wallets.includes(account.owner)){
                    wallets.push(account.owner);
                }
            }
        }
        if (tx.meta?.postTokenBalances){
            for (const account of tx.meta.postTokenBalances) {
                if (account.owner && !wallets.includes(account.owner)){
                    wallets.push(account.owner);
                }
            }
        }
        return wallets;
    }

}