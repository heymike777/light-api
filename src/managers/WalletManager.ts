import { CompiledInstruction } from "@triton-one/yellowstone-grpc/dist/grpc/solana-storage";
import { IWallet, Wallet, WalletStatus } from "../entities/Wallet";
import { BotManager } from "./bot/BotManager";
import { ParsedTx, ProgramManager, TxDescription } from "./ProgramManager";
import * as web3 from '@solana/web3.js';
import { newConnection } from "../services/solana/lib/solana";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { ExplorerManager } from "../services/explorers/ExplorerManager";
import { Helpers } from "../services/helpers/Helpers";
import { SolanaManager } from "../services/solana/SolanaManager";
import { TokenBalance } from "@solana/web3.js";
import { BN } from "bn.js";
import { kSolAddress } from "../services/solana/Constants";
import { Token, TokenManager, TokenNft } from "./TokenManager";
import { kMinSolChange } from "../services/Constants";
import { ParsedTransactionWithMeta } from "@solana/web3.js";
import { MetaplexManager } from "./MetaplexManager";
import { UserTransaction } from "../entities/UserTransaction";
import { ChangedWallet, ChangedWalletTokenChange, ChatWallets, TransactionApiResponse } from "../models/types";
import { FirebaseManager } from "./FirebaseManager";
import { IUser } from "../entities/User";
import { BadRequestError } from "../errors/BadRequestError";
import { PremiumError } from "../errors/PremiumError";
import { YellowstoneManager } from "../services/solana/geyser/YellowstoneManager";
import { SubscriptionManager } from "./SubscriptionManager";
import { MixpanelManager } from "./MixpanelManager";
import { UserManager } from "./UserManager";

export class WalletManager {

    static walletsMap: Map<string, IWallet[]> = new Map();
    static programIds: string[] = [];

    static async addWallet(chatId: number, user: IUser, walletAddress: string, title?: string, ipAddress?: string): Promise<IWallet>{
        const existingWallet = await Wallet.findOne({userId: user.id, walletAddress: walletAddress});
        if (existingWallet){
            existingWallet.title = title;
            await existingWallet.save();

            // Update cache
            const tmpWallets = this.walletsMap.get(walletAddress);
            if (tmpWallets){
                for (let wallet of tmpWallets){
                    if (wallet.userId == user.id){
                        wallet.title = title;
                        break;
                    }
                }
            }

            return existingWallet;
        }
        else {
            const walletsCount = await Wallet.countDocuments({userId: user.id});
            const kMaxWallets = SubscriptionManager.getMaxNumberOfWallets(user.subscription?.tier);
            if (walletsCount >= kMaxWallets){
                if (user.subscription){
                    MixpanelManager.trackError(user.id, { text: `Wallets limit reached with ${user.subscription.tier} subscription` }, ipAddress);
                    throw new PremiumError(`You have reached the maximum number of wallets. Please get the higher plan to track more than ${kMaxWallets} wallets.`);
                }
                else {
                    MixpanelManager.trackError(user.id, { text: `Wallets limit reached with free subscription` }, ipAddress);
                    throw new PremiumError('You have reached the maximum number of wallets. Please upgrade to Pro to track more wallets.');
                }
            }
            console.log('all good, add wallet');

            const wallet = new Wallet({
                chatId: chatId,
                userId: user.id,
                walletAddress: walletAddress,
                title: title,
                isVerified: false,
                createdAt: new Date(),
                status: WalletStatus.ACTIVE,
            });
            await wallet.save();

            MixpanelManager.track('Add wallet', user.id, { walletAddress: walletAddress }, ipAddress);

            // Update cache
            this.addWalletToCache(wallet);

            YellowstoneManager.resubscribeAll();

            return wallet;
        }
    }

    static addWalletToCache(wallet: IWallet){
        let tmpWallets = this.walletsMap.get(wallet.walletAddress);
        if (tmpWallets){
            const isExists = tmpWallets.find((tmpWallet) => tmpWallet.id == wallet.id);
            if (!isExists){
                tmpWallets.push(wallet);
            }
        }
        else {
            tmpWallets = [wallet];
        }
        this.walletsMap.set(wallet.walletAddress, tmpWallets);
    }

    static removeWalletFromCache(wallet: IWallet){
        const tmpWallets = this.walletsMap.get(wallet.walletAddress);
        if (tmpWallets){
            const newWallets = tmpWallets.filter((tmpWallet) => tmpWallet.id != wallet.id);
            if (newWallets.length == 0){
                this.walletsMap.delete(wallet.walletAddress);
            }
            else {
                this.walletsMap.set(wallet.walletAddress, newWallets);
            }
        }
    }

    static async removeWallets(chatId: number, userId: string, walletAddresses: string[], ipAddress?: string){
        const wallets = await Wallet.find({userId: userId, walletAddress: {$in: walletAddresses}});
        await Wallet.deleteMany({userId: userId, walletAddress: {$in: walletAddresses}});

        for (let walletAddress of walletAddresses){
            MixpanelManager.track('Remove wallet', userId, { walletAddress: walletAddress }, ipAddress);
        }

        for (let wallet of wallets){
            this.removeWalletFromCache(wallet);
        }

        YellowstoneManager.resubscribeAll();
    }

    static async removeWallet(wallet: IWallet, ipAddress?: string){
        await Wallet.deleteOne({_id: wallet.id});

        MixpanelManager.track('Remove wallet', wallet.userId, { walletAddress: wallet.walletAddress }, ipAddress);

        // Remove from cache
        this.removeWalletFromCache(wallet);

        YellowstoneManager.resubscribeAll();
    }

    static async fetchWalletsByUserId(userId: string): Promise<IWallet[]> {
        return Wallet.find({ userId });
    }

    static async fetchAllWalletAddresses() {
        const wallets = await Wallet.find({status: WalletStatus.ACTIVE});
        this.walletsMap.clear();
        for (let wallet of wallets){
            if (this.walletsMap.has(wallet.walletAddress)){
                this.walletsMap.get(wallet.walletAddress)?.push(wallet);
            }
            else {
                this.walletsMap.set(wallet.walletAddress, [wallet]);
            }
        }

        YellowstoneManager.resubscribeAll();
    }

    static kBatchSize = 200;
    static signaturesQueue: string[] = [];
    static async processWalletTransactionBySignature(signature: string) {
        this.signaturesQueue.push(signature);
        if (this.signaturesQueue.length >= this.kBatchSize){
            this.processTransactionsBySignaturesBatch();
        }
    }

    static async processTransactionsBySignaturesBatch(){
        const signatures = this.signaturesQueue.splice(0, this.signaturesQueue.length);

        try {
            const connection = newConnection();
            const txs = await SolanaManager.getParsedTransactions(connection, signatures);
            for (const tx of txs){
                await this.processWalletTransaction(tx);
            }         
        }
        catch (err) {
            console.error(new Date(), 'processWalletTransaction2', 'Error:', err);
        }
    }

    static async processWalletTransaction(tx: web3.ParsedTransactionWithMeta) {
        try{
            const signature = tx.transaction.signatures[0];
                        
            if (!tx.transaction || !tx.meta){
                console.error(new Date(), 'processWalletTransaction', 'tx not found', signature);
                return;
            }

            const walletsInvolved = this.getInvolvedWallets(tx);

            const wallets: IWallet[] = [];
            for (const walletInvolved of walletsInvolved) {
                const tmpWallets = this.walletsMap.get(walletInvolved);
                if (tmpWallets){
                    wallets.push(...tmpWallets);
                }
            }

            const chats: ChatWallets[] = [];
            for (let wallet of wallets){
                const chat = chats.find((c) => c.user.id == wallet.userId);

                if (chat){
                    chat.wallets.push(wallet);
                }
                else {
                    const user = await UserManager.getUserById(wallet.userId);
                    chats.push({user: user, wallets: [wallet]});
                }
            }

            if (chats.length == 0){
                return;
            }

            await this.processTxForChats(signature, tx, chats);   
        }
        catch (err) {
            console.error(new Date(), 'processWalletTransaction1', 'Error:', err);
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

    static async processTxForChats(signature: string, tx: ParsedTransactionWithMeta, chats: ChatWallets[]){
        try {
            if (!tx.meta){
                console.error('MigrationManager', 'migrate', 'tx not found', signature);
                return;
            }

            // console.log('processTxForChats', 'signature', signature, 'chats', chats);

            const parsedTx = await ProgramManager.parseTx(tx);
            // console.log('!!parsedTx', parsedTx);
            let asset: TokenNft | undefined = undefined;
            
            if (parsedTx.assetId){
                asset = await MetaplexManager.fetchAssetAndParseToTokenNft(parsedTx.assetId);
                // console.log('!asset', asset);
            }

            let sentUserIds: string[] = [];

            console.log('processTxForChats', 'chats', JSON.stringify(chats));

            for (const chat of chats) {
                // console.log('!!!chat', chat);
                const info = await this.processTx(parsedTx, asset, chat);
                asset = info.asset;

                if (info.hasWalletsChanges || info.asset || process.env.ENVIRONMENT == 'DEVELOPMENT'){
                    try {
                        //TODO: don't save tx if that's a channel or group chat
                        const userTx = new UserTransaction();
                        userTx.userId = chat.wallets[0].userId;
                        userTx.parsedTx = parsedTx;
                        userTx.changedWallets = info.changedWallets;
                        userTx.createdAt = new Date(parsedTx.blockTime * 1000);
                        userTx.tokens = info.transactionApiResponse.tokens;
                        userTx.signature = parsedTx.signature;
                        await userTx.save();

                        let isTelegramSent = false;
                        if (chat.user.telegram?.id){
                            BotManager.sendMessage({ 
                                chatId: chat.user.telegram?.id, 
                                text: info.message, 
                                imageUrl: asset?.image 
                            });
                            isTelegramSent = true;
                        }

                        let isPushSent = false;
                        const userId = chat.wallets?.[0]?.userId;
                        if (userId && !sentUserIds.includes(userId)){
                            sentUserIds.push(userId);
                            FirebaseManager.sendPushToUser(userId, info.transactionApiResponse.title, info.transactionApiResponse.description, asset?.image, { open: 'transactions' });
                            isPushSent = true;
                        }

                        MixpanelManager.track('Process transaction', userTx.userId, { isPushSent: isPushSent, isTelegramSent: isTelegramSent });
                    }
                    catch (err) {
                        // console.error(new Date(), 'WalletManager', 'processTxForChats', 'Error:', err);
                    }
                }
            }
        }
        catch (err) {
            console.error(new Date(), 'WalletManager', 'processTxForChats', 'Error:', err);
        }

    }

    static async processTx(parsedTx: ParsedTx, asset: TokenNft | undefined, chat: ChatWallets){
        console.log(new Date(), 'processTx', 'parsedTx', parsedTx, 'asset', asset, 'chat', chat);
        let hasWalletsChanges = false;
        let message = `[${parsedTx.title}]\n`;

        const txDescription = ProgramManager.findTxDescription(parsedTx.parsedInstructions, chat.wallets);

        if (txDescription){
            message += '{description}\n';
        }

        const txPreBalances = parsedTx.preBalances || [];
        const txPostBalances = parsedTx.postBalances || [];
        const txPreTokenBalances = parsedTx.preTokenBalances || [];
        const txPostTokenBalances = parsedTx.postTokenBalances || [];
        const tokens: Token[] = [];

        const changedWallets: ChangedWallet[] = [];
        // console.log('!parsedTx.walletsInvolved', parsedTx.walletsInvolved);
        for (const walletInvolved of parsedTx.walletsInvolved) {
            const wallet = chat.wallets.find((w) => w.walletAddress === walletInvolved);
            if (wallet){
                const walletAccountIndex = parsedTx.accounts.findIndex((a) => a == walletInvolved);

                let blockMessage = '';
                const walletTitle = wallet.title || wallet.walletAddress;
                blockMessage += `\n🏦 <a href="${ExplorerManager.getUrlToAddress(wallet.walletAddress)}">${walletTitle}</a>`;

                const walletTokenChanges: ChangedWalletTokenChange[] = [];
                const tokenBalances: { accountIndex: number, mint?: string, balanceChange: number, pre: TokenBalance | undefined, post: TokenBalance | undefined }[] = [];

                if (txPreTokenBalances || txPostTokenBalances){
                    const accountIndexes: number[] = [];

                    if (txPreTokenBalances){
                        for (const preTokenBalance of txPreTokenBalances) {
                            if (preTokenBalance.owner == walletInvolved && !accountIndexes.includes(preTokenBalance.accountIndex)){
                                accountIndexes.push(preTokenBalance.accountIndex);
                            }
                        }
                    }
                    if (txPostTokenBalances){
                        for (const postTokenBalance of txPostTokenBalances) {
                            if (postTokenBalance.owner == walletInvolved && !accountIndexes.includes(postTokenBalance.accountIndex)){
                                accountIndexes.push(postTokenBalance.accountIndex);
                            }
                        }
                    }

                    for (const accountIndex of accountIndexes){
                        const preTokenBalance = txPreTokenBalances?.find((b: any) => b.accountIndex == accountIndex);
                        const postTokenBalance = txPostTokenBalances?.find((b: any) => b.accountIndex == accountIndex);
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
                const nativeBalanceChange = txPostBalances[walletAccountIndex] - txPreBalances[walletAccountIndex];
                const wsolBalanceChange = tokenBalances.find((b) => b.mint == kSolAddress)?.balanceChange || 0;                    
                const balanceChange = nativeBalanceChange / web3.LAMPORTS_PER_SOL + wsolBalanceChange;
                if (balanceChange && Math.abs(balanceChange) >= kMinSolChange){
                    hasBalanceChange = true;
                    hasWalletsChanges = true;
                    const token = await TokenManager.getToken(kSolAddress);
                    if (token) tokens.push(token);

                    // const amount = +Helpers.prettyNumber(balanceChange, 3);
                    let amountUSD = token && token.price ? Math.round(Math.abs(balanceChange) * token.price * 100)/100 : undefined;
                    if (amountUSD!=undefined && balanceChange<0) { amountUSD = -amountUSD; }

                    const tokenValueString = token && token.price ? '(' + (balanceChange<0?'-':'') + '$'+Math.round(Math.abs(balanceChange) * token.price * 100)/100 + ')' : '';
                    blockMessage += `\n<a href="${ExplorerManager.getUrlToAddress(kSolAddress)}">SOL</a>: ${balanceChange>0?'+':''}${Helpers.prettyNumber(balanceChange, 3)} ${tokenValueString}`;

                    walletTokenChanges.push({
                        mint: kSolAddress,
                        symbol: 'SOL',
                        description: `${balanceChange>0?'+':''}${Helpers.prettyNumber(balanceChange, 3)} ${tokenValueString}`,
                    });
                }

                for (const tokenBalance of tokenBalances) {
                    const mint = tokenBalance.pre?.mint || tokenBalance.post?.mint || undefined;
                    if (mint && mint != kSolAddress){
                        hasBalanceChange = true;
                        hasWalletsChanges = true;
                        const token = await TokenManager.getToken(mint);
                        if (token) tokens.push(token);

                        if (token?.nft && !asset){
                            asset = token.nft;
                        }
                        const balanceChange = tokenBalance.balanceChange;
                        const tokenValueString = token && token.price ? '(' + (balanceChange<0?'-':'') + '$'+Math.round(Math.abs(balanceChange) * token.price * 100)/100 + ')' : '';
                        const tokenName = token && token.symbol ? token.symbol : Helpers.prettyWallet(mint);
                        blockMessage += `\n<a href="${ExplorerManager.getUrlToAddress(mint)}">${tokenName}</a>: ${balanceChange>0?'+':''}${Helpers.prettyNumber(balanceChange, 3)} ${tokenValueString}`;            

                        walletTokenChanges.push({
                            mint: mint,
                            symbol: tokenName,
                            description: `${balanceChange>0?'+':''}${Helpers.prettyNumber(balanceChange, 3)} ${tokenValueString}`,
                        });
                    }
                }

                console.log('!hasBalanceChange', hasBalanceChange, 'walletAddress', wallet.walletAddress, 'blockMessage:', blockMessage);

                if (hasBalanceChange){
                    message += blockMessage;

                    const changedWallet: ChangedWallet = {
                        walletAddress: wallet.walletAddress,
                        title: walletTitle,
                        explorerUrl: ExplorerManager.getUrlToAddress(wallet.walletAddress),
                        tokenChanges: walletTokenChanges,
                    };
                    changedWallets.push(changedWallet);
                }
            }
        }

        if (!asset){
            // Try to find asset from list of balances

            const balances = [
                ...txPreTokenBalances || [],
                ...txPostTokenBalances || [],
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
                const preTokenBalance = txPreTokenBalances?.find((b: any) => b.mint == mint);
                const postTokenBalance = txPostTokenBalances?.find((b: any) => b.mint == mint);

                if (preTokenBalance && postTokenBalance){
                    if (
                        (preTokenBalance.uiTokenAmount.amount == '0' || preTokenBalance.uiTokenAmount.amount == '1')
                        && (postTokenBalance.uiTokenAmount.amount == '0' || postTokenBalance.uiTokenAmount.amount == '1')
                    ){
                        uniqueNftMints.push(mint);
                    }
                }
            }

            for (const mint of uniqueNftMints) {
                asset = await MetaplexManager.fetchAssetAndParseToTokenNft(mint);
                if (asset){
                    break;
                }
            }
        }

        if (asset && asset.title){
            asset.title = asset.title.trim();
        }

        if (asset){
            hasWalletsChanges = true;
        }

        if (asset){
            const marketplace = ExplorerManager.getMarketplace(asset.id);
            message += `\n\n${asset.title} | <a href="${marketplace.url}">${marketplace.title}</a>`;

            if (asset.attributes && asset.attributes.length > 0){
                message += `\n\n<b>Attributes:\n</b>`;
                message += `${asset.attributes.map((a) => '- ' + a.trait_type + ': ' + a.value).join('\n')}`;
            }
        }

        if (asset){
            const assetToken: Token = {
                address: asset.id,
                name: asset.title,
                symbol: asset.title,
                decimals: 0,
                // price?: number,
                priceUpdatedAt: Date.now(),                    
                nft: asset,
            };
            tokens.push(assetToken);
        }

        message += '\n\n';

        const explorerUrl = ExplorerManager.getUrlToTransaction(parsedTx.signature);
        message += `<a href="${explorerUrl}">Explorer</a>`;

        if (txDescription){
            let description = txDescription.html;
            description = Helpers.replaceAddressesWithPretty(description, txDescription.addresses, chat.wallets, tokens);
            message = message.replace('{description}', description);
        }

        const description = txDescription?.plain ? Helpers.replaceAddressesWithPretty(txDescription.plain, txDescription?.addresses, chat.wallets, tokens) : undefined;

        console.log('!changedWallets', JSON.stringify(changedWallets));

        const txApiResponse: TransactionApiResponse = {
            title: parsedTx.title,
            description: description,
            explorerUrl: explorerUrl,
            signature: parsedTx.signature,
            blockTime: parsedTx.blockTime,
            wallets: [],
            tokens: tokens,
        };

        while (message.includes('\n\n\n')){
            message = message.replace('\n\n\n', '\n\n');
        }

        console.log('!message', message);

        return {
            hasWalletsChanges,
            message,
            asset,
            transactionApiResponse: txApiResponse,
            changedWallets,
        };

        // if (hasWalletsChanges && chat.id != -1){
        //     BotManager.sendMessage({ 
        //         chatId: chat.id, 
        //         text: message, 
        //         imageUrl: asset?.image 
        //     });
        // }
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

    static async pauseWallet(wallet: IWallet){
        if (wallet.status != WalletStatus.PAUSED){
            await Wallet.updateOne({ _id: wallet.id }, { status: WalletStatus.PAUSED });
            this.removeWalletFromCache(wallet);
            YellowstoneManager.resubscribeAll();
        }
    }

    static async activateWallet(wallet: IWallet){
        if (wallet.status != WalletStatus.ACTIVE){
            await Wallet.updateOne({ _id: wallet.id }, { status: WalletStatus.ACTIVE });
            this.addWalletToCache(wallet);
            YellowstoneManager.resubscribeAll();
        }
    }

}