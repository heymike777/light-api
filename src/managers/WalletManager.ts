import { CompiledInstruction } from "@triton-one/yellowstone-grpc/dist/types/grpc/solana-storage";
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
import { getNativeToken, kSolAddress } from "../services/solana/Constants";
import { TokenManager } from "./TokenManager";
import { kMinSolChange } from "../services/Constants";
import { ParsedTransactionWithMeta } from "@solana/web3.js";
import { MetaplexManager } from "./MetaplexManager";
import { UserTransaction } from "../entities/users/UserTransaction";
import { ChangedWallet, ChangedWalletTokenChange, ChatWallets, TransactionApiResponse } from "../models/types";
import { FirebaseManager } from "./FirebaseManager";
import { IUser } from "../entities/users/User";
import { BadRequestError } from "../errors/BadRequestError";
import { PremiumError } from "../errors/PremiumError";
import { YellowstoneManager } from "../services/solana/geyser/YellowstoneManager";
import { SubscriptionManager } from "./SubscriptionManager";
import { MixpanelManager } from "./MixpanelManager";
import { UserManager } from "./UserManager";
import { IToken, ITokenModel, Token, TokenNft } from "../entities/tokens/Token";
import { Chain } from "../services/solana/types";
import { LogManager } from "./LogManager";
import { TraderProfilesManager } from "./TraderProfilesManager";
import { RedisManager } from "./db/RedisManager";
import { SystemNotificationsManager } from "./SytemNotificationsManager";
import { EnvManager } from "./EnvManager";
import { SvmManager } from "./svm/SvmManager";

export class WalletManager {

    static walletsMap: Map<string, IWallet[]> = new Map();

    static statsStartedAt: number | undefined = undefined;
    static stats: Record<string, number> = {};

    static forbiddenWallets: string[] = [
        '11111111111111111111111111111111',
    ]

    static async addWallet(chatId: number, user: IUser, walletAddress: string, title?: string, ipAddress?: string, traderProfileId?: string): Promise<IWallet>{
        //check if walletAddress is a valid address
        if (SolanaManager.isValidPublicKey(walletAddress) == false){
            MixpanelManager.trackError(user.id, { text: `Invalid wallet address: ${walletAddress}` }, ipAddress);
            throw new BadRequestError('Invalid wallet address');
        }

        if (this.forbiddenWallets.includes(walletAddress)){
            MixpanelManager.trackError(user.id, { text: `Forbidden wallet address: ${walletAddress}` }, ipAddress);
            throw new BadRequestError('Forbidden wallet address');
        }

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
            if (!traderProfileId){
                const walletsCount = await Wallet.countDocuments({userId: user.id, traderProfileId: {$exists: false}});
                const kMaxWallets = SubscriptionManager.getMaxNumberOfWallets(user.subscription?.tier);
                if (walletsCount >= kMaxWallets){
                    MixpanelManager.trackError(user.id, { text: `Wallets limit reached with ${user.subscription?.tier || 'free'} subscription` }, ipAddress);

                    if (user.subscription){
                        throw new PremiumError(`You have reached the maximum number of wallets. Please get the higher plan to track more than ${kMaxWallets} wallets.`);
                    }
                    else {
                        throw new PremiumError('You have reached the maximum number of wallets. Please upgrade to Pro to track more wallets.');
                    }                    
                }
            }
            LogManager.log('all good, add wallet');

            const wallet = new Wallet({
                chatId: chatId,
                userId: user.id,
                walletAddress: walletAddress,
                title: title,
                isVerified: false,
                createdAt: new Date(),
                status: traderProfileId ? WalletStatus.TRADER : WalletStatus.ACTIVE,
                traderProfileId: traderProfileId,
            });
            await wallet.save();

            MixpanelManager.track('Add wallet', user.id, { walletAddress, traderProfileId }, ipAddress);

            // Update cache
            this.addWalletToCache(wallet);

            YellowstoneManager.resubscribeAll();

            return wallet;
        }
    }

    static addWalletToCache(wallet: IWallet, shouldBroadcast: boolean = true){
        let tmpWallets = this.walletsMap.get(wallet.walletAddress);
        if (tmpWallets){
            const existingWallet = tmpWallets.find((tmpWallet) => tmpWallet.id == wallet.id);
            if (!existingWallet){
                tmpWallets.push(wallet);
            }
            else {
                existingWallet.title = wallet.title;
            }
        }
        else {
            tmpWallets = [wallet];
        }
        this.walletsMap.set(wallet.walletAddress, tmpWallets);

        if (shouldBroadcast){
            RedisManager.publishWalletEvent({
                type: 'add',
                wallet,
            });
        }
        
    }

    static removeWalletFromCache(wallet: IWallet, shouldBroadcast: boolean = true){
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

        if (shouldBroadcast){
            RedisManager.publishWalletEvent({
                type: 'delete',
                wallet,
            });    
        }
    }

    static async removeWallets(chatId: number, userId: string, walletAddresses: string[], ipAddress?: string){
        const wallets = await Wallet.find({userId: userId, walletAddress: {$in: walletAddresses}});
        await Wallet.deleteMany({userId: userId, walletAddress: {$in: walletAddresses}, status: {$in: [WalletStatus.ACTIVE, WalletStatus.PAUSED, WalletStatus.PAUSED_PERMANENTLY]}});

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

    static async fetchAllWalletAddresses(shouldResubscribe: boolean = true){
        const wallets = await Wallet.find({status: {$in: [WalletStatus.ACTIVE, WalletStatus.TRADER]}});
        
        this.walletsMap.clear();
        for (let wallet of wallets){
            if (this.walletsMap.has(wallet.walletAddress)){
                this.walletsMap.get(wallet.walletAddress)?.push(wallet);
            }
            else {
                this.walletsMap.set(wallet.walletAddress, [wallet]);
            }
        }        

        if (shouldResubscribe && EnvManager.isGeyserProcess){
            if (EnvManager.chain == Chain.SOLANA){
                YellowstoneManager.resubscribeAll();
            }
            else {
                const svms = SvmManager.svms;
                for (const svm of svms) {
                    await svm.resubscribeAll();                    
                }
            }
        }
    }

    static async processWalletTransaction(chain: Chain, tx: web3.ParsedTransactionWithMeta, geyserId: string) {
        try{
            const signature = tx.transaction.signatures[0];
                        
            if (!tx.transaction || !tx.meta){
                LogManager.error('processWalletTransaction', 'tx not found', signature);
                return;
            }

            const walletsInvolved = this.getInvolvedWallets(tx);
            // console.log(tx.transaction.signatures[0], 'walletsInvolved', walletsInvolved);

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
                    if (user){
                        chats.push({user: user, wallets: [wallet]});
                    }
                }
            }

            if (chats.length == 0){
                return;
            }

            await this.processTxForChats(chain, signature, tx, chats, geyserId);   
        }
        catch (err) {
            LogManager.error('processWalletTransaction1', 'Error:', err);
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

    static async processTxForChats(chain: Chain, signature: string, tx: ParsedTransactionWithMeta, chats: ChatWallets[], geyserId: string){
        try {
            if (!tx.meta){
                LogManager.error('MigrationManager', 'migrate', 'tx not found', signature);
                return;
            }

            LogManager.log('processTxForChats', 'signature', signature, 'chats', chats);

            const parsedTx = await ProgramManager.parseTx(chain, tx);
            // LogManager.log('!!parsedTx', parsedTx);
            let asset: TokenNft | undefined = undefined;
            
            if (parsedTx.assetId){
                asset = await MetaplexManager.fetchAssetAndParseToTokenNft(chain, parsedTx.assetId);
                // LogManager.log('!asset', asset);
            }

            let sentUserIds: string[] = [];

            LogManager.log('processTxForChats', signature, 'chats', JSON.stringify(chats));

            for (const chat of chats) {
                // LogManager.log('!!!chat', chat);
                const info = await this.processTx(chain, parsedTx, asset, chat);
                asset = info.asset;
                LogManager.log('processTxForChats', signature, 'info.hasWalletsChanges:', info.hasWalletsChanges);

                if (info.hasWalletsChanges || info.asset || process.env.ENVIRONMENT == 'DEVELOPMENT'){
                    try {
                        //TODO: don't save tx if that's a channel or group chat
                        if (!this.statsStartedAt){ this.statsStartedAt = Date.now(); }
                        this.stats[chat.wallets[0].userId] = (this.stats[chat.wallets[0].userId] || 0) + 1;

                        const userTx = new UserTransaction();
                        userTx.geyserId = geyserId;
                        userTx.chain = chain;
                        userTx.userId = chat.wallets[0].userId;
                        userTx.parsedTx = parsedTx;
                        userTx.changedWallets = info.changedWallets;
                        userTx.createdAt = new Date(parsedTx.blockTime * 1000);
                        userTx.tokens = info.transactionApiResponse.tokens?.filter((token) => token.address != kSolAddress);
                        userTx.signature = parsedTx.signature;

                        let addedTx: boolean = false;
                        try {
                            addedTx = await RedisManager.saveUserTransaction(userTx);
                            // LogManager.forceLog('addedToRedis:', addedTx);        
                        }
                        catch (err: any) {
                            await userTx.save();
                            addedTx = true;
                            LogManager.error('WalletManager', 'processTxForChats', 'Error saving to Redis:', err);
                            SystemNotificationsManager.sendSystemMessage('🔴🔴🔴 Error saving to Redis: ' + err.message);
                        }

                        if (addedTx){
                            let isTelegramSent = false;
                            if (chat.user.telegram?.id){
                                BotManager.sendMessage({                                     
                                    id: `user_${chat.user.id}_signature_${signature}_${Helpers.makeid(12)}`,
                                    userId: chat.user.id,
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
                                isPushSent = await FirebaseManager.sendPushToUser(userId, info.transactionApiResponse.title, info.transactionApiResponse.description, asset?.image, { open: 'transactions' });
                            }

                            // MixpanelManager.track('Process transaction', userTx.userId, { isPushSent: isPushSent, isTelegramSent: isTelegramSent });
                        }
                    }
                    catch (err) {
                        // LogManager.error('WalletManager', 'processTxForChats', 'Error:', err);
                    }
                }
            }
        }
        catch (err) {
            LogManager.error('WalletManager', 'processTxForChats', 'Error:', err);
        }

    }

    static async processTx(chain: Chain, parsedTx: ParsedTx, asset: TokenNft | undefined, chat: ChatWallets){
        LogManager.log('!processTx', 'parsedTx', JSON.stringify(parsedTx), 'asset', asset, 'chat', chat);
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
        const tokens: ITokenModel[] = [];
        const kSOL = getNativeToken(chain);

        const changedWallets: ChangedWallet[] = [];
        // LogManager.log('!parsedTx.walletsInvolved', parsedTx.walletsInvolved);
        for (const walletInvolved of parsedTx.walletsInvolved) {
            const wallet = chat.wallets.find((w) => w.walletAddress === walletInvolved);
            if (wallet){
                const walletAccountIndex = parsedTx.accounts.findIndex((a) => a == walletInvolved);

                let blockMessage = '';
                const walletTitle = wallet.title || Helpers.prettyWallet(wallet.walletAddress);
                blockMessage += `\n🏦 <a href="${ExplorerManager.getUrlToAddress(chain, wallet.walletAddress)}">${walletTitle}</a>`;

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
                        const lamportsPerToken = 10 ** (preTokenBalance?.uiTokenAmount.decimals || postTokenBalance?.uiTokenAmount.decimals || 0);
                        // const { div, mod } = balanceDiff.divmod(new BN(lamportsPerToken));
                        // const balanceChange = div.toNumber() + mod.toNumber() / lamportsPerToken;
                        const balanceChange = Helpers.bnDivBnWithDecimals(balanceDiff, new BN(lamportsPerToken), getNativeToken(chain).decimals);
                        

                        tokenBalances.push({ accountIndex, mint, balanceChange, pre: preTokenBalance, post: postTokenBalance });
                    }
                }

                let hasBalanceChange = false;
                const nativeBalanceChange = txPostBalances[walletAccountIndex] - txPreBalances[walletAccountIndex];
                const wsolBalanceChange = tokenBalances.find((b) => b.mint == kSolAddress)?.balanceChange || 0;                    
                const balanceChange = nativeBalanceChange / getNativeToken(chain).lamportsPerSol + wsolBalanceChange;
                if (balanceChange && Math.abs(balanceChange) >= kMinSolChange){
                    hasBalanceChange = true;
                    hasWalletsChanges = true;
                    const token = await TokenManager.getToken(chain, kSolAddress);
                    if (token) {
                        const existing = tokens.find((t) => t.address == token.address);
                        if (!existing) tokens.push(token);
                    }

                    // const amount = +Helpers.prettyNumber(balanceChange, 3);
                    let amountUSD = token && token.price ? Math.round(Math.abs(balanceChange) * token.price * 100)/100 : undefined;
                    if (amountUSD!=undefined && balanceChange<0) { amountUSD = -amountUSD; }

                    const totalUsdValue = Math.round(Math.abs(balanceChange) * (token?.price || 0) * 100)/100;
                    const tokenValueString = token && token.price && totalUsdValue>0 ? '(' + (balanceChange<0?'-':'') + '$'+ totalUsdValue + ')' : '';
                    blockMessage += `\n<a href="${ExplorerManager.getUrlToAddress(chain, kSolAddress)}">${kSOL.symbol}</a>: ${balanceChange>0?'+':''}${Helpers.prettyNumber(balanceChange, 3)} ${tokenValueString}`;

                    walletTokenChanges.push({
                        mint: kSolAddress,
                        symbol: kSOL.symbol,
                        description: `${balanceChange>0?'+':''}${Helpers.prettyNumber(balanceChange, 3)} ${tokenValueString}`,
                    });
                }

                for (const tokenBalance of tokenBalances) {
                    const mint = tokenBalance.pre?.mint || tokenBalance.post?.mint || undefined;
                    if (mint && mint != kSolAddress){
                        hasBalanceChange = true;
                        hasWalletsChanges = true;
                        const token = await TokenManager.getToken(chain, mint);
                        if (token) {
                            const existing = tokens.find((t) => t.address == token.address);
                            if (!existing) tokens.push(token);
                        }
    
                        if (token?.nft && !asset){
                            asset = token.nft;
                        }
                        const balanceChange = tokenBalance.balanceChange;
                        const totalUsdValue = Math.round(Math.abs(balanceChange) * (token?.price || 0) * 100)/100;
                        const tokenValueString = token && token.price && totalUsdValue>0 ? '(' + (balanceChange<0?'-':'') + '$'+totalUsdValue + ')' : '';
                        const tokenName = token && token.symbol ? token.symbol : Helpers.prettyWallet(mint);
                        blockMessage += `\n<a href="${ExplorerManager.getUrlToAddress(chain, mint)}">${tokenName}</a>: ${balanceChange>0?'+':''}${Helpers.prettyNumber(balanceChange, 3)} ${tokenValueString}`;            

                        walletTokenChanges.push({
                            mint: mint,
                            symbol: tokenName,
                            description: `${balanceChange>0?'+':''}${Helpers.prettyNumber(balanceChange, 3)} ${tokenValueString}`,
                        });
                    }
                }

                LogManager.log('!hasBalanceChange', hasBalanceChange, 'walletAddress', wallet.walletAddress, 'blockMessage:', blockMessage);

                if (hasBalanceChange){
                    message += blockMessage;

                    const changedWallet: ChangedWallet = {
                        walletAddress: wallet.walletAddress,
                        title: walletTitle,
                        explorerUrl: ExplorerManager.getUrlToAddress(chain, wallet.walletAddress),
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
                asset = await MetaplexManager.fetchAssetAndParseToTokenNft(chain, mint);
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

        let tokensMessage = '';
        if (tokens && tokens.length > 0){
            for (const token of tokens) {
                const msg = BotManager.buildTokenMetricsMessage(token);
                if (msg){
                    tokensMessage += msg + '\n';
                }
            }
        }
        if (tokensMessage.length > 0){
            message += '\n\n';
            message += tokensMessage;
            message += '\n';
        }

        if (asset){
            const assetToken: ITokenModel = {
                chain: Chain.SOLANA,
                address: asset.id,
                decimals: 0,
                symbol: asset.title,
                name: asset.title,
                nft: asset,
                priceUpdatedAt: Date.now(),
            }
            if (assetToken) {
                const existing = tokens.find((t) => t.address == assetToken.address);
                if (!existing) tokens.push(assetToken);
            }
        }

        message += '\n\n';

        const explorerUrl = ExplorerManager.getUrlToTransaction(chain, parsedTx.signature);
        message += `<a href="${explorerUrl}">Explorer</a>`;

        if (txDescription){
            let description = txDescription.html;
            description = Helpers.replaceAddressesWithPretty(description, txDescription.addresses, chat.wallets, tokens);
            message = message.replace('{description}', description);
        }

        const plainText = txDescription?.html ? Helpers.htmlToPlainText(txDescription?.html) : undefined;
        const description = plainText ? Helpers.replaceAddressesWithPretty(plainText, txDescription?.addresses, chat.wallets, tokens) : undefined;

        LogManager.log('!changedWallets', JSON.stringify(changedWallets));

        const txApiResponse: TransactionApiResponse = {
            chain: chain,
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

        LogManager.log('!message', message);

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
        if (wallet.status == WalletStatus.ACTIVE){
            await Wallet.updateOne({ _id: wallet.id }, { status: WalletStatus.PAUSED });
            this.removeWalletFromCache(wallet);
            YellowstoneManager.resubscribeAll();
        }
    }

    static async activateWallet(wallet: IWallet){
        if (wallet.status == WalletStatus.PAUSED){
            await Wallet.updateOne({ _id: wallet.id }, { status: WalletStatus.ACTIVE });
            this.addWalletToCache(wallet);
            YellowstoneManager.resubscribeAll();
        }
    }

}