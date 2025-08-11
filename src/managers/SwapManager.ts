import { IUserTraderProfile } from "../entities/users/TraderProfile";
import { getNativeToken, kSolAddress, kUsdcAddress, kUsdcMintDecimals } from "../services/solana/Constants";
import { Chain, Engine, Priority } from "../services/solana/types";
import { JupiterManager } from "./JupiterManager";
import { BadRequestError } from "../errors/BadRequestError";
import * as web3 from "@solana/web3.js";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { newConnectionByChain, newConnectionForLandingTxs } from "../services/solana/lib/solana";
import { SolanaManager } from "../services/solana/SolanaManager";
import { IMint, ISwap, StatusType, Swap, SwapDex, SwapType } from "../entities/payments/Swap";
import { LogManager } from "./LogManager";
import { TraderProfilesManager } from "./TraderProfilesManager";
import { UserTransaction } from "../entities/users/UserTransaction";
import { BotManager } from "./bot/BotManager";
import { UserManager } from "./UserManager";
import { FirebaseManager } from "./FirebaseManager";
import { MixpanelManager } from "./MixpanelManager";
import { TokenManager } from "./TokenManager";
import { Helpers } from "../services/helpers/Helpers";
import { RedisManager } from "./db/RedisManager";
import { SystemNotificationsManager } from "./SytemNotificationsManager";
import { Currency } from "../models/types";
import { SwapMode } from "@jup-ag/api";
import { RaydiumManager } from "../services/solana/RaydiumManager";
import { BN } from "bn.js";
import { SegaManager } from "../services/solana/svm/SegaManager";
import { ParsedTransactionWithMeta } from "@solana/web3.js";
import { IUser, User } from "../entities/users/User";
import { SubscriptionTier } from "../entities/payments/Subscription";
import { UserRefReward } from "../entities/referrals/UserRefReward";
import { ReferralsManager } from "./ReferralsManager";
import { CobaltxManager } from "../services/solana/svm/CobaltxManager";
import { EventsManager } from "./EventsManager";
import { TradingEventStatus } from "../entities/events/TradingEvent";
import { FarmManager } from "./FarmManager";
import { TokenPriceManager } from "./TokenPriceManager";

export class SwapManager {

    static kDefaultEngineId = 'lightbot';
    static kNativeEngineId = 'light';
    static engines: Engine[] = [
        {
            id: this.kNativeEngineId,
            title: 'Light',
            logo: 'https://light.dangervalley.com/static/light.png',
            isSubscriptionRequired: false,
            isExternal: false,
        },
        {
            id: 'lightbot',
            title: 'Light',
            logo: 'https://light.dangervalley.com/static/light.png',
            url: 'https://t.me/light_sol_bot?start=r-heymike777',
            tokenUrl: 'https://t.me/light_sol_bot?start=r-heymike777-ca-{token}',
            isSubscriptionRequired: false,
            isExternal: true,
        },
        {
            id: 'bonkbot',
            title: 'BonkBot',
            logo: 'https://light.dangervalley.com/static/bonkbot.png',
            url: 'https://t.me/bonkbot_bot?start=ref_ceqh3',
            tokenUrl: 'https://t.me/bonkbot_bot?start=ref_ceqh3_ca_{token}',
            isSubscriptionRequired: true,
            isExternal: true,
        },
        {
            id: 'maestro_base',
            title: 'Maestro',
            logo: 'https://light.dangervalley.com/static/maestro.png',
            url: 'https://t.me/maestro?start=r-heymike777',
            tokenUrl: 'https://t.me/maestro?start={token}-heymike777',
            isSubscriptionRequired: true,
            isExternal: true,
        },
        {
            id: 'maestro_pro',
            title: 'Maestro Pro',
            logo: 'https://light.dangervalley.com/static/maestro.png',
            url: 'https://t.me/maestropro?start=r-heymike777',
            tokenUrl: 'https://t.me/maestropro?start={token}-heymike777',
            isSubscriptionRequired: true,
            isExternal: true,
        },
        {
            id: 'photon',
            title: 'Photon',
            logo: 'https://light.dangervalley.com/static/photon.jpg',
            url: 'https://photon-sol.tinyastro.io/@heymike',
            tokenUrl: 'https://photon-sol.tinyastro.io/en/r/@heymike/{token}',
            isSubscriptionRequired: true,
            isExternal: true,
        },
        {
            id: 'trojan',
            title: 'Trojan',
            logo: 'https://light.dangervalley.com/static/trojan.png',
            url: 'https://t.me/solana_trojanbot?start=r-heymike777',
            tokenUrl: 'https://t.me/solana_trojanbot?start=r-heymike777-{token}',
            isSubscriptionRequired: true,
            isExternal: true,
        },
        {
            id: 'bananagun',
            title: 'BananaGun',
            logo: 'https://light.dangervalley.com/static/bananagun.png',
            url: 'https://t.me/BananaGun_bot?start=ref_heymike',
            tokenUrl: 'https://t.me/BananaGun_bot?start=ref_heymike_{token}',
            isSubscriptionRequired: true,
            isExternal: true,
        },
        {
            id: 'nova',
            title: 'Nova',
            logo: 'https://light.dangervalley.com/static/nova.jpg',
            url: 'https://t.me/TradeonNovaBot?start=r-heymike',
            tokenUrl: 'https://t.me/TradeonNovaBot?start=r-heymike-{token}',
            isSubscriptionRequired: true,
            isExternal: true,
        },
        {
            id: 'gmgn',
            title: 'GMGN',
            logo: 'https://light.dangervalley.com/static/gmgn.png',
            url: 'https://t.me/GMGN_sol_bot?start=i_gSWRgmGL',
            tokenUrl: 'https://t.me/GMGN_sol_bot?start=i_gSWRgmGL_c_{token}',
            isSubscriptionRequired: true,
            isExternal: true,
        },
        // BullX / BullX NEO
    ];

    // static async buy(swap: ISwap, traderProfile: IUserTraderProfile, triesLeft = 3): Promise<string | undefined> {
    //     return this.buyAndSell(swap.type, swap, traderProfile, triesLeft);
    // }

    // static async sell(swap: ISwap, traderProfile: IUserTraderProfile, triesLeft = 3): Promise<string | undefined> {
    //     return this.buyAndSell(swap.type, swap, traderProfile, triesLeft);
    // }

    static async buyAndSell(user: IUser | undefined, swap: ISwap, traderProfile: IUserTraderProfile, triesLeft: number = 1): Promise<string | undefined> {
        if (!user) {
            LogManager.error('SwapManager', swap.type, 'User not found', { swap });
            return;
        }

        LogManager.log('buyAndSell', 'type:', swap.type, 'triesLeft', triesLeft, 'swap:', swap, 'traderProfile:', traderProfile);
        swap.status.type = StatusType.START_PROCESSING;
        const res = await Swap.updateOne({ _id: swap._id, "status.type": StatusType.CREATED }, { $set: { status: swap.status } });
        if (res.modifiedCount === 0) {
            LogManager.error('SwapManager', swap.type, 'Swap status is not CREATED', { swap });
            return;
        }

        const tpWallet = traderProfile.getWallet();
        if (!tpWallet){
            LogManager.error('SwapManager', swap.type, 'Trader profile wallet not found', { traderProfile });
            swap.status.type = StatusType.CREATED;
            swap.status.tryIndex++;
            await Swap.updateOne({ _id: swap._id, 'status.type': StatusType.START_PROCESSING }, { $set: { status: swap.status } });
            return;
        }
        const amount = swap.amountIn;

        const stakedConnection = newConnectionForLandingTxs(swap.chain);
        const keypair = web3.Keypair.fromSecretKey(bs58.decode(tpWallet.privateKey));
        const connection = newConnectionByChain(swap.chain);
        let signature: string | undefined;
        let blockhash: string | undefined;
        const currency = traderProfile.currency || Currency.SOL;

        try {
            const inputMint = swap.from.mint;// swap.type == SwapType.BUY ? currencyMintAddress : mint;
            const outputMint = swap.to.mint;// swap.type == SwapType.BUY ? mint : currencyMintAddress;
            const slippage = (swap.type == SwapType.BUY ? traderProfile.buySlippage : (traderProfile.sellSlippage || traderProfile.buySlippage)) || 50;
            LogManager.log('SwapManager', 'inputMint', inputMint, 'outputMint', outputMint, 'amount', amount, 'slippage', slippage);

            let instructions: web3.TransactionInstruction[] = [];
            let swapAmountInLamports: string = '0';
            let addressLookupTableAccounts: web3.AddressLookupTableAccount[] | undefined = undefined;
            let tx: web3.VersionedTransaction | undefined = undefined;

            if (swap.dex == SwapDex.JUPITER){
                try {
                    const quote = await JupiterManager.getQuote(inputMint, outputMint, +amount, slippage, SwapMode.ExactIn);
                    if (!quote) {
                        swap.status.type = StatusType.CREATED;
                        swap.status.tryIndex++;
                        await Swap.updateOne({ _id: swap._id, 'status.type': StatusType.START_PROCESSING }, { $set: { status: swap.status } });    
                        return;
                    }

                    const priorityFee = traderProfile.priorityFee || Priority.MEDIUM;

                    const swapData = await JupiterManager.swapInstructions(quote.quoteResponse, tpWallet.publicKey, priorityFee, {
                        includeOtherInstruction: true,
                        includeSwapInstruction: true,
                        includeComputeBudgetInstructions: true,
                        includeCleanupInstruction: true,
                        includeSetupInstructions: true,
                    });

                    instructions = swapData.instructions;
                    const addressLookupTableAddresses = swapData.addressLookupTableAddresses;
                    addressLookupTableAccounts = await SolanaManager.getAddressLookupTableAccounts(connection, addressLookupTableAddresses);

                    LogManager.log('SwapManager', 'swapData', swapData);

                    swapAmountInLamports = swap.type == SwapType.BUY ? amount : quote.quoteResponse.outAmount;

                    // add 0.5% fee instruction to tx
                    const fee = SwapManager.getFeeSize(user, swap.chain);
                    instructions.push(this.createFeeInstruction(Chain.SOLANA, +swapAmountInLamports, tpWallet.publicKey, currency, fee));

                    blockhash = (await SolanaManager.getRecentBlockhash(swap.chain)).blockhash;
                    tx = await SolanaManager.createVersionedTransaction(swap.chain, instructions, keypair, addressLookupTableAccounts, blockhash, false)
                }
                catch (error: any) {
                    SystemNotificationsManager.sendSystemMessage('🔴 JupiterManager error:' + error.message);
                }
            }
            else if (swap.dex == SwapDex.SEGA){
                const segaResults = await SegaManager.swap(user, traderProfile, inputMint, outputMint, new BN(amount), slippage, swap.poolId);
                swapAmountInLamports = segaResults.swapAmountInLamports.toString();
                tx = segaResults.tx;
                blockhash = segaResults.blockhash;
            }
            else if (swap.dex == SwapDex.COBALTX){
                const cobaltxResults = await CobaltxManager.swap(swap.chain, user, traderProfile, inputMint, outputMint, new BN(amount), slippage);
                swapAmountInLamports = cobaltxResults.swapAmountInLamports.toString();
                tx = cobaltxResults.tx;
                blockhash = cobaltxResults.blockhash;

                console.log('CobaltxManager swap results:', cobaltxResults);
            }

            if (swap.from.mint == kSolAddress || swap.to.mint == kSolAddress){
                swap.value = {
                    sol: +swapAmountInLamports / getNativeToken(swap.chain).lamportsPerSol,
                    usd : Math.round((+swapAmountInLamports / getNativeToken(swap.chain).lamportsPerSol) * TokenManager.getNativeTokenPrice(swap.chain) * 100) / 100,
                }
            }
            else {
                const prices = await TokenPriceManager.getTokensPrices(swap.chain, [swap.from.mint, swap.to.mint]);
                const fromPrice = prices.find(price => price.address == swap.from.mint)?.price || 0;
                const toPrice = prices.find(price => price.address == swap.to.mint)?.price || 0;
                if (fromPrice > 0 && swap.from.decimals != undefined){
                    const tmp = new BN(amount).mul(new BN(fromPrice));
                    const usd = +Helpers.bnToUiAmount(tmp, swap.from.decimals);
                    swap.value = {
                        sol: usd / TokenManager.getNativeTokenPrice(swap.chain),
                        usd: usd,
                    }
                }
                else if (toPrice > 0 && swap.to.decimals != undefined){
                    //TODO: amount is wrong here. I should get amount from segaResults.swapAmountInLamports
                    // const tmp = new BN(amount).mul(new BN(toPrice));
                    // const usd = +Helpers.bnToUiAmount(tmp, swap.to.decimals);
                    // swap.value = {
                    //     sol: usd / TokenManager.getNativeTokenPrice(swap.chain),
                    //     usd: usd,
                    // }
                }
            }

            // calculate points for trading event based on chain, mint, and swap.value.usd
            let points: { [eventId: string]: number } | undefined = undefined;
            const event = await EventsManager.getActiveEvent(true);
            if (event && event.status == TradingEventStatus.ACTIVE && (!event.chains || event.chains.includes(swap.chain)) && event.tradingPoints){
                const fromPoints = event.tradingPoints[`${swap.chain}:${swap.from.mint}`] || 0;
                const toPoints = event.tradingPoints[`${swap.chain}:${swap.to.mint}`] || 0;
                const allPoints = event.tradingPoints['*'] || 0;
                const tmpPoints = Math.max(fromPoints, toPoints, allPoints);
                if (tmpPoints > 0){
                    if (!points){
                        points = {};
                    }
                    points[event.id] = tmpPoints * (swap.value?.usd || 0);
                }
            }
            await Swap.updateOne({ _id: swap._id }, { $set: { value: swap.value, points: points } });
            
            if (!tx){
                throw new BadRequestError('Transaction not found');
            }

            signature = await stakedConnection.sendTransaction(tx, { skipPreflight: true, maxRetries: 0 });
            LogManager.log('SwapManager', 'signature', signature);
        }
        catch (error: any) {
            LogManager.error('!catched SwapManager', swap.type, error);       
            
            if (triesLeft <= 0) {
                swap.status.type = StatusType.CANCELLED;
                swap.status.tryIndex++;
                await Swap.updateOne({ _id: swap._id, 'status.type': StatusType.START_PROCESSING }, { $set: { status: swap.status } });
                if (swap.farmId){
                    await FarmManager.swapFailed(swap);
                }

                return;
            }

            swap.status.type = StatusType.CREATED;
            swap.status.tryIndex++;
            await Swap.updateOne({ _id: swap._id, 'status.type': StatusType.START_PROCESSING }, { $set: { status: swap.status } });

            // repeat the transaction            
            return await this.buyAndSell(user, swap, traderProfile, triesLeft - 1);
        }

        swap.status.type = StatusType.PROCESSING;
        swap.status.tryIndex++;
        swap.status.tx = {
            signature,
            blockhash: blockhash || '',
            sentAt: new Date(),
        };
        if (!swap.status.txs) { swap.status.txs = []; };
        swap.status.txs.push(swap.status.tx);
        await Swap.updateOne({ _id: swap._id }, { $set: { status: swap.status } });

        return signature;
    }

    static createFeeInstruction(chain: Chain, swapAmountInLamports: number, walletAddress: string, currency = Currency.SOL, fee = 0.01): web3.TransactionInstruction {
        if (currency == Currency.USDC){
            const usdcTokenAta = process.env.FEE_USDC_TOKEN_ADDRESS;
            if (!usdcTokenAta) {
                throw new BadRequestError('USDC token address not found');
            }

            throw new BadRequestError('USDC fee instruction not implemented yet');
            //TODO: add USDC fee instruction + add FEE_USDC_TOKEN_ADDRESS to env
        }
        else {
            const feeWalletAddress = process.env.FEE_SOL_WALLET_ADDRESS;
            if (!feeWalletAddress) {
                throw new BadRequestError('Fee wallet address not found');
            }

            const feeAmount = Math.round(swapAmountInLamports * fee);
            const feeInstruction = web3.SystemProgram.transfer({
                fromPubkey: new web3.PublicKey(walletAddress),
                toPubkey: new web3.PublicKey(feeWalletAddress),
                lamports: feeAmount,
            });

            return feeInstruction;
        }
    }

    static async receivedConfirmationForSignature(chain: Chain, signature: string, parsedTransactionWithMeta?: ParsedTransactionWithMeta) {
        const swap = await Swap.findOne({ chain: chain, 'status.tx.signature': signature });
        if (!swap) {
            // LogManager.error('SwapManager', 'receivedConfirmation', 'Swap not found', { signature });
            return;
        }

        ReferralsManager.receivedConfirmationForSignature(chain, signature);

        const now = new Date();

        //TODO: set into SWAP how many SOL & Tokens I spent / reveived. I need it for P&L calculations

        swap.status.type = StatusType.COMPLETED;
        if (swap.status.tx && swap.status.tx.signature == signature) {
            swap.status.tx.confirmedAt = new Date();
        }

        if (swap.status.txs){
            for (const tx of swap.status.txs) {
                if (tx.signature == signature) {
                    tx.confirmedAt = now;
                }
            }
        }

        const updateResult = await Swap.updateOne({ _id: swap._id, "status.type": {$ne: StatusType.COMPLETED} }, { $set: { status: swap.status } });
        if (updateResult.modifiedCount > 0){
            await this.saveReferralRewards(swap, signature, parsedTransactionWithMeta);
            if (swap.farmId) {
                await FarmManager.swapCompleted(swap);
            }
            this.trackSwapInMixpanel(swap);

            // Update user's volume for this chain
            const user = await UserManager.getUserById(swap.userId);
            if (user && swap.value?.usd) {
                const volume = user.volume || {};
                volume[swap.chain] = (volume[swap.chain] || 0) + swap.value.usd;
                await User.updateOne({ _id: user._id }, { $set: { volume } });
            }
        }
        else {
            LogManager.error('SwapManager', 'receivedConfirmation', 'Swap not updated', `modifiedCount = ${updateResult.modifiedCount}`, 'swap:', { swap });
        }
    }

    static async checkPendingSwaps() {
        const swaps = await Swap.find({ "status.type": StatusType.PROCESSING });
        // console.log('SwapManager', 'checkPendingSwaps', 'Pending swaps:', swaps.length);
        if (!swaps || swaps.length === 0) {
            return;
        }

        const chainValues = Object.values(Chain); 
        for (const chain of chainValues) {
            const blockhashes: string[] = [];

            const signatures = swaps.map(swap => swap.chain == chain && swap.status.tx?.signature).filter(signature => signature) as string[];

            if (signatures.length === 0) {
                continue;
            }

            const connection = newConnectionByChain(chain);
            const signatureStatuses = await connection.getSignatureStatuses(signatures);

            for (let index = 0; index < signatures.length; index++) {
                const signature = signatures[index];
                const signatureStatus = signatureStatuses.value[index];
                const swap = swaps.find(swap => swap.status.tx?.signature == signature);
                if (!swap) {
                    LogManager.error('SwapManager', 'checkPendingSwaps', 'Swap not found', { signature });
                    continue;
                }
    
                if (!signatureStatus) {
                    if (swap.status.tx && swap.status.tx.blockhash) {
                        if (!blockhashes.includes(swap.status.tx.blockhash)) {
                            blockhashes.push(swap.status.tx.blockhash);
                        }
                    }
                    continue;
                }
                else {
                    if (signatureStatus.err) {
                        LogManager.error('SwapManager', 'checkPendingSwaps', signatureStatus.err);
                        swap.status.type = StatusType.CREATED;
                        swap.status.tryIndex++;
                        await Swap.updateOne({ _id: swap._id }, { $set: { status: swap.status } });
    
                        continue;
                    }
                    else if (signatureStatus.confirmationStatus === 'confirmed' || signatureStatus.confirmationStatus === 'finalized') {
                        // should I do anything here? I think at this moment swap is already confirmed from geyser. 
                        // maybe I should add this tx to geyser, just in case it's missed?
    
                        swap.status.type = StatusType.COMPLETED;
                        swap.status.tx!.confirmedAt = new Date();
                        const updateResult = await Swap.updateOne({ _id: swap._id, "status.type": {$ne: StatusType.COMPLETED} }, { $set: { status: swap.status } });
                        if (updateResult.modifiedCount > 0){
                            await this.saveReferralRewards(swap, signature);
                            if (swap.farmId){ 
                                await FarmManager.swapCompleted(swap);
                            }
                            this.trackSwapInMixpanel(swap);
                        }
                    }
                }
            }
    
            // fetch blockhashes statusses
            for (const blockhash of blockhashes) {
                const isValid = await SolanaManager.isBlockhashValid(blockhash, chain);
                if (isValid) {
                    continue;
                }
                else if (isValid == false){
                    // then set status from PENDING to CREATED 
                    for (const swap of swaps) {
                        if (swap.chain == chain &&  swap.status.tx?.blockhash == blockhash && swap.status.type == StatusType.PROCESSING) {
                            swap.status.type = StatusType.CREATED;
                            swap.status.tryIndex++;
                            await Swap.updateOne({ _id: swap._id, 'status.type': StatusType.PROCESSING }, { $set: { status: swap.status } });
                        }
                    }
                }
                else if (isValid == undefined){
                    LogManager.error('SwapManager', 'checkPendingSwaps', 'Blockhash is undefined', { blockhash });
                    // is this the same as isValid == false ??
                }
            }
        }
    }

    static async retrySwaps() {        
        const swaps = await Swap.find({ "status.type": StatusType.CREATED });
        LogManager.log('SwapManager', 'retrySwaps', 'Retrying swaps:', swaps.length);
        if (!swaps || swaps.length === 0) {
            return;
        }

        for (const swap of swaps) {
            if (swap.status.tryIndex >= 10) {
                swap.status.type = StatusType.CANCELLED;
                const tmp = await Swap.updateOne({ _id: swap._id, 'status.type': StatusType.CREATED }, { $set: { status: swap.status } });
                if (tmp.modifiedCount > 0) {
                    LogManager.error('SwapManager', 'retrySwaps', 'Swap cancelled', { swap });
                    if (swap.farmId){
                        await FarmManager.swapFailed(swap);
                    }
                    await this.sendSwapErrorToUser(swap);
                    continue;
                }
            }

            const traderProfile = await TraderProfilesManager.findById(swap.traderProfileId);
            if (traderProfile) {
                const user = await UserManager.getUserById(swap.userId);

                if (swap.type === SwapType.BUY) {
                    await this.buyAndSell(user, swap, traderProfile);
                }
                else if (swap.type === SwapType.SELL) {
                    await this.buyAndSell(user, swap, traderProfile);
                }
            }
        }
    }

    static async sendSwapErrorToUser(swap: ISwap) {
        const user = await UserManager.getUserById(swap.userId);
        if (!user) {
            LogManager.error('SwapManager', 'sendErrorToUser', 'User not found', { swap });
            return;
        }

        // const token = await TokenManager.getToken(swap.chain, swap.mint);

        // let internalMessage = `${swap.type} tx`;
        // if (token){
        //     const bnAmount = new BN(swap.amountIn);
        //     const bnDecimalsAmount = swap.type == SwapType.BUY ? new BN(getNativeToken(swap.chain).lamportsPerSol) : new BN(10 ** (token.decimals || 0))
        //     // const { div, mod } = bnAmount.divmod(bnDecimalsAmount);
        //     // const amountIn = div.toString() + (mod.eqn(0) ? '' : '.' + mod.toString());

        //     const amountIn = '' + Helpers.bnDivBnWithDecimals(bnAmount, bnDecimalsAmount, getNativeToken(swap.chain).decimals);
        //     const actionString = swap.type == SwapType.BUY 
        //         ? `buy ${token.symbol} for ${Helpers.prettyNumberFromString(amountIn, 6)} ${getNativeToken(swap.chain).symbol}` 
        //         : `sell ${Helpers.prettyNumberFromString(amountIn, 6)} ${token.symbol}`;
        //     internalMessage = `tx to ${actionString}`
        // }
        const message = `We tried to process your swap, but it failed every time. Check that your trader wallet is funded, double check your slippage, and try again.`

        // const userTx = new UserTransaction();
        // userTx.geyserId = 'manual';
        // userTx.chain = swap.chain;
        // userTx.userId = swap.userId;
        // userTx.title = swap.type == SwapType.BUY ? 'BUY ERROR' : 'SELL ERROR';
        // userTx.description = message;
        // userTx.createdAt = new Date();
        // userTx.tokens = token ? [token] : [];
        // userTx.signature = `manual_${swap.userId}_${Date.now()}`;

        // let addedTx: boolean = false;
        // try {
            // addedTx = await RedisManager.saveUserTransaction(userTx);
        //     // LogManager.forceLog('addedToRedis:', addedTx);  
        // }
        // catch (err: any) {
        //     addedTx = true;
        //     await userTx.save();
        //     LogManager.error('WalletManager', 'processTxForChats', 'Error saving to Redis:', err);
        //     SystemNotificationsManager.sendSystemMessage('🔴🔴🔴 Error saving to Redis: ' + err.message);
        // }

        // if (addedTx){
            // let isTelegramSent = false;
            if (user.telegram?.id){
                BotManager.sendMessage({ 
                    id: `user_${user.id}_swap_${swap.id}_${Helpers.makeid(12)}`,
                    userId: user.id,
                    chatId: user.telegram?.id, 
                    text: message, 
                });
                // isTelegramSent = true;
            }
    
            // let isPushSent = await FirebaseManager.sendPushToUser(swap.userId, `[SWAP ERROR]`, message, undefined, { open: 'transactions' });
    
            MixpanelManager.trackError(swap.userId, { text: message });    
        // }
    }

    static async trackSwapInMixpanel(swap: ISwap) {
        const solValue = swap.value?.sol || 0;
        const usdValue = swap.value?.usd || 0;
        const mint = (swap.from.mint == kSolAddress || swap.to.mint == kSolAddress) 
            ? (swap.from.mint == kSolAddress ? swap.to.mint : swap.from.mint) 
            : undefined;

        MixpanelManager.track(`Swap`, swap.userId, { 
            chain: swap.chain, 
            type: swap.type,
            traderProfileId: swap.traderProfileId,
            dex: swap.dex,
            mint,
            from: swap.from.mint,
            to: swap.to.mint,
            solValue,
            usdValue,
            farmId: swap.farmId,
            poolId: swap.poolId,
            // currency: swap.currency,
        });
    }

    static async initiateBuy(user: IUser, chain: Chain, traderProfileId: string, from: IMint, to: IMint, amount: number, farmId?: string, poolId?: string): Promise<{signature?: string, swap: ISwap}>{
        console.log('initiateBuy', 'traderProfileId:', traderProfileId, 'from:', from, 'to:', to, 'amount:', amount, 'poolId:', poolId);
        let dex: SwapDex;
        if (chain == Chain.SOLANA){
            dex = SwapDex.JUPITER;
        }
        else if (chain == Chain.SONIC){
            dex = SwapDex.SEGA;
        }
        else if (chain == Chain.SOON_MAINNET || chain == Chain.SVMBNB_MAINNET || chain == Chain.SOONBASE_MAINNET){
            dex = SwapDex.COBALTX;
        }
        else {
            throw new BadRequestError('Unsupported chain');
        }
        const kSOL = getNativeToken(chain);

        const traderProfile = await TraderProfilesManager.findById(traderProfileId);
        if (!traderProfile){
            throw new BadRequestError('Trader profile not found');
        }
        const userId = traderProfile.userId;
        const currency = traderProfile.currency || Currency.SOL;

        if (traderProfile.engineId !== SwapManager.kNativeEngineId){
            throw new BadRequestError('Only Light engine is supported');
        }

        const tpWallet = traderProfile.getWallet();
        if (!tpWallet){
            throw new BadRequestError('Trader profile wallet not found');
        }

        if (amount <= 0.0001){
            throw new BadRequestError('Amount should be greater than 0');
        }

        if (chain != Chain.SOLANA && currency != Currency.SOL){
            throw new BadRequestError(`Only ${kSOL.symbol} is supported for this chain`);
        }

        if (!farmId){
            // no need to check balance if farmId is provided. we already checked it in FarmManager.makeSwap
            const balance = await SolanaManager.getWalletSolBalance(chain, tpWallet.publicKey);
            const minSolRequired = from.mint == kSolAddress ? amount  + 0.01 : 0.01;
            if (!balance || balance.uiAmount < minSolRequired){
                throw new BadRequestError(`Insufficient ${kSOL.symbol} balance.\nBalance: ${balance?.uiAmount || 0}\nMin required: ${minSolRequired}`);
            }

            if (from.mint != kSolAddress){
                const balance = await SolanaManager.getWalletTokenBalance(chain, tpWallet.publicKey, from.mint);
                if (!balance || balance.uiAmount < amount){
                    throw new BadRequestError(`Insufficient ${from.mint} balance.\nBalance: ${balance?.uiAmount || 0}\nMin required: ${amount}`);
                }    
            }
        }

        if (from.decimals == undefined){
            throw new BadRequestError('From mint decimals is not defined');
        }

        const amountInLamports = amount * (10 ** from.decimals);

        const swap = new Swap();
        swap.chain = chain;
        swap.type = SwapType.BUY;
        swap.dex = dex;
        swap.currency = currency;
        swap.userId = userId;
        swap.traderProfileId = traderProfileId;
        swap.amountIn = amountInLamports.toString();
        swap.from = from;
        swap.to = to;
        swap.mint = to.mint;
        swap.createdAt = new Date();
        swap.status = {
            type: StatusType.CREATED,
            tryIndex: 0,
        };
        swap.farmId = farmId;
        swap.poolId = poolId;
        await swap.save();

        MixpanelManager.track('Swap Init', userId, { chain: chain, type: swap.type, dex: swap.dex, mint: swap.mint, currency: swap.currency, traderProfileId: swap.traderProfileId});

        let signature: string | undefined;
        if (swap.type == SwapType.BUY){
            signature = await SwapManager.buyAndSell(user, swap, traderProfile);
        }
        return { signature, swap };
    }

    static async initiateSell(user: IUser, chain: Chain, traderProfileId: string, from: IMint, to: IMint, amountPercents: number, farmId?: string, poolId?: string): Promise<{ signature?: string, swap: ISwap }>{ 
        let dex: SwapDex;
        if (chain == Chain.SOLANA){
            dex = SwapDex.JUPITER;
        }
        else if (chain == Chain.SONIC){
            dex = SwapDex.SEGA;
        }
        else if (chain == Chain.SOON_MAINNET || chain == Chain.SVMBNB_MAINNET || chain == Chain.SOONBASE_MAINNET){
            dex = SwapDex.COBALTX;
        }
        else {
            throw new BadRequestError('Unsupported chain');
        }
        const kSOL = getNativeToken(chain);
        LogManager.log('initiateSell', dex, traderProfileId, 'from:', from, 'to:', to, `${amountPercents}%`);

        const traderProfile = await TraderProfilesManager.findById(traderProfileId);
        if (!traderProfile){
            throw new BadRequestError('Trader profile not found');
        }

        if (traderProfile.engineId !== SwapManager.kNativeEngineId){
            throw new BadRequestError('Only Light engine is supported');
        }

        const tpWallet = traderProfile.getWallet();
        if (!tpWallet){
            throw new BadRequestError('Trader profile wallet not found');
        }

        if (amountPercents <= 0 || amountPercents > 100){
            throw new BadRequestError('Amount is invalid');
        }

        const currency = traderProfile.currency || Currency.SOL;
        const userId = traderProfile.userId;

        if (!farmId){
            // no need to check balance if farmId is provided. we already checked it in FarmManager.makeSwap
            const solBalance = await SolanaManager.getWalletSolBalance(chain, tpWallet.publicKey);
            const minSolRequired = 0.01;
            if (!solBalance || solBalance.uiAmount < minSolRequired){
                throw new BadRequestError(`Insufficient ${kSOL.symbol} balance`);
            }
        }

        let amountInLamports = new BN(0);
        const balance = await SolanaManager.getWalletTokenBalance(chain, tpWallet.publicKey, from.mint);
        if (!balance){
            throw new BadRequestError('Insufficient balance');
        }

        if (balance.decimals != undefined){
            from.decimals = balance.decimals;
        }

        amountInLamports = amountPercents == 100 ? balance.amount : balance.amount.muln(amountPercents).divn(100);
        const balanceAmount = new BN(balance.amount || 0);

        if (amountInLamports.gt(balanceAmount)){
            throw new BadRequestError('Insufficient balance');
        }

        const swap = new Swap();
        swap.chain = chain;
        swap.type = SwapType.SELL;
        swap.dex = dex;
        swap.userId = userId;
        swap.traderProfileId = traderProfileId;
        swap.amountIn = amountInLamports.toString();
        swap.currency = currency;
        swap.from = from;
        swap.to = to;
        swap.mint = from.mint;
        swap.createdAt = new Date();
        swap.status = {
            type: StatusType.CREATED,
            tryIndex: 0,
        };
        swap.intermediateWallet = undefined;
        swap.farmId = farmId;
        swap.poolId = poolId;
        await swap.save();

        MixpanelManager.track('Swap Init', userId, { chain: chain, type: swap.type, dex: swap.dex, mint: swap.mint, currency: swap.currency, traderProfileId: swap.traderProfileId});

        let signature: string | undefined;
        if (swap.type == SwapType.SELL){
            signature = await SwapManager.buyAndSell(user, swap, traderProfile);
        }

        return { signature, swap };
    }

    static async saveReferralRewards(swap: ISwap, signature: string, tx?: ParsedTransactionWithMeta) {
        console.log('saveReferralRewards (1)', signature, swap.id);

        if (!tx) {
            const txInfo = await SolanaManager.getParsedTransaction(swap.chain, signature);
            if (txInfo) {
                tx = txInfo;
            }
        }   

        if (!tx) {
            LogManager.error('SwapManager', 'saveReferralRewards', 'Transaction not found', { swap, signature });
            MixpanelManager.trackError(swap.userId, { text: 'saveReferralRewards: transaction not found', signature });
            return;
        }

        // calc how much SOL / USDC fee wallet got
        const feeWalletAddress = process.env.FEE_SOL_WALLET_ADDRESS;
        if (!feeWalletAddress) {
            LogManager.error('SwapManager', 'saveReferralRewards', 'Fee wallet address not found');
            MixpanelManager.trackError(swap.userId, { text: 'saveReferralRewards: fee wallet address not found' });
            return;
        }
        const feeWalletPublicKey = new web3.PublicKey(feeWalletAddress);
        if (swap.currency == Currency.SOL){
            const feeAccountIndex = tx.transaction.message.accountKeys.findIndex((key) => key.pubkey.equals(feeWalletPublicKey));
            if (feeAccountIndex === -1) {
                LogManager.error('SwapManager', 'saveReferralRewards', 'Fee wallet not found in transaction', { swap });
                MixpanelManager.trackError(swap.userId, { text: 'saveReferralRewards: fee wallet not found in transaction' });
                return;
            }
            const feeLamports = (tx.meta?.postBalances[feeAccountIndex] || 0) - (tx.meta?.preBalances[feeAccountIndex] || 0);

            console.log('saveReferralRewards (2)', signature, 'feeLamports', feeLamports, 'lamports (SOL)');
            if (feeLamports <= 0){
                LogManager.error('SwapManager', 'saveReferralRewards', 'Fee wallet balance not changed', { swap });
                MixpanelManager.trackError(swap.userId, { text: 'saveReferralRewards: fee wallet balance not changed' });
                return;
            }

            const feeSol = feeLamports / getNativeToken(swap.chain).lamportsPerSol;
            const feeUsd = Math.round(feeSol * TokenManager.getNativeTokenPrice(swap.chain) * 100000) / 100000;
            swap.referralRewards = {
                fee: {
                    sol: feeLamports,
                    usd: feeUsd,
                },
                users: {},
            };
        }
        else if (swap.currency == Currency.USDC){
            const preTokenBalance = tx.meta?.preTokenBalances?.find((balance) => balance.owner === feeWalletAddress);
            const postTokenBalance = tx.meta?.postTokenBalances?.find((balance) => balance.owner === feeWalletAddress);

            if (!preTokenBalance || !postTokenBalance) {
                LogManager.error('SwapManager', 'saveReferralRewards', 'Fee wallet not found in transaction', { swap });
                MixpanelManager.trackError(swap.userId, { text: 'saveReferralRewards: fee wallet not found in transaction' });
                return;
            }
            const feeLamports = +postTokenBalance.uiTokenAmount.amount - +preTokenBalance.uiTokenAmount.amount;
            console.log('saveReferralRewards (3)', signature, 'feeLamports', feeLamports, 'lamports (USDC)');
            const feeUsdc = feeLamports / (10 ** kUsdcMintDecimals);

            swap.referralRewards = {
                fee: {
                    usdc: feeUsdc,
                    usd: feeUsdc,
                },
                users: {},
            };
        }
        else {
            LogManager.error('SwapManager', 'saveReferralRewards', 'Currency not supported', { swap });
            MixpanelManager.trackError(swap.userId, { text: 'saveReferralRewards: currency not supported' });
            return;
        }

        // split fee between users
        const user = await UserManager.getUserById(swap.userId);
        if (!user) {
            LogManager.error('SwapManager', 'saveReferralRewards', 'User not found', { swap });
            MixpanelManager.trackError(swap.userId, { text: 'saveReferralRewards: user not found' });
            return;
        }

        const percents = [25, 4, 3, 2, 1];
        let tempUser = user;
        for (let index = 0; index < percents.length; index++) {
            let percent = percents[index];
            console.log('saveReferralRewards (split1)', index, 'userId:', tempUser.id, 'percent:', percent);

            let parent: IUser | undefined = undefined;
            if (tempUser.parent){
                parent = await UserManager.getUserById(tempUser.parent.userId);
            }
            if (!parent) { break; }

            if (index == 0){
                // if user is ambassador, then add 15%, so he has 40% total (as platinum user)
                // if user has premium, then add 5 for SILVER, 10 for GOLD, 15 for PLATINUM
                if (parent.isAmbassador){
                    percent += 15;
                }
                else if (parent.subscription?.tier == SubscriptionTier.SILVER){
                    percent += 5;
                }
                else if (parent.subscription?.tier == SubscriptionTier.GOLD){
                    percent += 10;
                }
                else if (parent.subscription?.tier == SubscriptionTier.PLATINUM){
                    percent += 15;
                }
            }

            const totalFee = swap.referralRewards.fee;
            swap.referralRewards.users[parent.id] = {
                sol: totalFee.sol ? Math.floor(totalFee.sol * percent / 100) : undefined,
                usdc: totalFee.usdc ? Math.floor(totalFee.usdc * percent / 100) : undefined,
                usd: totalFee.usd * percent / 100,
            };

            tempUser = parent;
        }

        // save swap
        await Swap.updateOne({ _id: swap.id }, { $set: { referralRewards: swap.referralRewards } });

        if (swap.referralRewards?.users){
            for (const userId in swap.referralRewards.users) {
                const element = swap.referralRewards.users[userId];

                const userRefReward = new UserRefReward();
                userRefReward.userId = userId;
                userRefReward.swapId = swap.id;
                userRefReward.chain = swap.chain;
                userRefReward.currency = swap.currency;
                userRefReward.amount = (swap.currency == Currency.SOL ? element.sol : element.usdc) || 0;
                userRefReward.usdAmount = element.usd;
                userRefReward.createdAt = new Date();
                await userRefReward.save();
            }
        }

    }

    static getFeeSize(user: IUser, chain?: Chain): number {
        return 0.005;
        // if (chain == Chain.SOON_MAINNET || chain == Chain.SVMBNB_MAINNET || chain == Chain.SOONBASE_MAINNET){
        //     const volume = user.volume || {};
        //     const volumeOnChain = volume[chain] || 0;
        //     if (volumeOnChain < 1000){
        //         return 0.005;
        //     }
        //     else {
        //         return 0.003;
        //     }
        // }
        // else {
        //     return user.parent ? 0.009 : 0.01;
        // }
    }

}