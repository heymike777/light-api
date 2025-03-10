import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { IUserTraderProfile } from "../entities/users/TraderProfile";
import { kSolAddress, kUsdcAddress } from "../services/solana/Constants";
import { Engine } from "../services/solana/types";
import { JupiterManager } from "./JupiterManager";
import { QuoteGetSwapModeEnum } from "@jup-ag/api";
import { BadRequestError } from "../errors/BadRequestError";
import * as web3 from "@solana/web3.js";
import { HeliusManager } from "../services/solana/HeliusManager";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { newConnection } from "../services/solana/lib/solana";
import { SolanaManager } from "../services/solana/SolanaManager";
import { ISwap, StatusType, Swap, SwapType } from "../entities/payments/Swap";
import { LogManager } from "./LogManager";
import { TraderProfilesManager } from "./TraderProfilesManager";
import { UserTransaction } from "../entities/users/UserTransaction";
import { BotManager } from "./bot/BotManager";
import { UserManager } from "./UserManager";
import { FirebaseManager } from "./FirebaseManager";
import { MixpanelManager } from "./MixpanelManager";
import { TokenManager } from "./TokenManager";
import { lamports } from "@metaplex-foundation/umi";
import { Helpers } from "../services/helpers/Helpers";
import { BN } from "bn.js";
import { RedisManager } from "./db/RedisManager";
import { SystemNotificationsManager } from "./SytemNotificationsManager";
import { Currency } from "../models/types";

export class SwapManager {

    static kDefaultEngineId = 'trojan';
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

    static async buy(swap: ISwap, traderProfile: IUserTraderProfile, triesLeft: number = 10): Promise<string | undefined> {
        return this.buyAndSell(SwapType.BUY, swap, traderProfile, triesLeft);
    }

    static async sell(swap: ISwap, traderProfile: IUserTraderProfile, triesLeft: number = 10): Promise<string | undefined> {
        return this.buyAndSell(SwapType.SELL, swap, traderProfile, triesLeft);
    }

    static async buyAndSell(type: SwapType, swap: ISwap, traderProfile: IUserTraderProfile, triesLeft: number = 10): Promise<string | undefined> {
        swap.status.type = StatusType.START_PROCESSING;
        const res = await Swap.updateOne({ _id: swap._id, "status.type": StatusType.CREATED }, { $set: { status: swap.status } });
        if (res.modifiedCount === 0) {
            LogManager.error('SwapManager', type, 'Swap status is not CREATED', { swap });
            return;
        }

        if (!traderProfile.wallet){
            LogManager.error('SwapManager', type, 'Trader profile wallet not found', { traderProfile });
            swap.status.type = StatusType.CREATED;
            swap.status.tryIndex++;
            await Swap.updateOne({ _id: swap._id, 'status.type': StatusType.START_PROCESSING }, { $set: { status: swap.status } });
            return;
        }
        const mint = swap.mint;
        const amount = swap.amountIn;

        const stakedConnection = newConnection(process.env.HELIUS_STAKED_CONNECTIONS_URL!);
        const keypair = web3.Keypair.fromSecretKey(bs58.decode(traderProfile.wallet.privateKey));
        const connection = newConnection();
        let signature: string | undefined;
        let blockhash: string | undefined;
        const currency = traderProfile.currency || Currency.SOL;
        const currencyMintAddress = currency == Currency.SOL ? kSolAddress : kUsdcAddress;

        try {
            const inputMint = type == SwapType.BUY ? currencyMintAddress : mint;
            const outputMint = type == SwapType.BUY ? mint : currencyMintAddress;
            const slippage = (type == SwapType.BUY ? traderProfile.buySlippage : (traderProfile.sellSlippage || traderProfile.buySlippage)) || 50;

            const quote = await JupiterManager.getQuote(inputMint, outputMint, +amount, slippage, QuoteGetSwapModeEnum.ExactIn);
            if (!quote) {
                swap.status.type = StatusType.CREATED;
                swap.status.tryIndex++;
                await Swap.updateOne({ _id: swap._id, 'status.type': StatusType.START_PROCESSING }, { $set: { status: swap.status } });    
                return;
            }

            LogManager.log('SwapManager', 'quote', quote);

            const prioritizationFeeLamports = await HeliusManager.getRecentPrioritizationFees();

            const swapData = await JupiterManager.swapInstructions(quote.quoteResponse, traderProfile.wallet.publicKey, slippage, prioritizationFeeLamports, {
                includeTokenLedgerInstruction: true,
                includeSwapInstruction: true,
                includeComputeBudgetInstructions: true,
                includeCleanupInstruction: true,
                includeSetupInstructions: true,
            });

            const instructions = swapData.instructions;
            const addressLookupTableAddresses = swapData.addressLookupTableAddresses;
            const addressLookupTableAccounts = await SolanaManager.getAddressLookupTableAccounts(connection, addressLookupTableAddresses);

            LogManager.log('SwapManager', 'swapData', swapData);

            // add 1% fee instruction to tx
            const swapAmountInLamports = type == SwapType.BUY ? amount : quote.quoteResponse.outAmount;
            instructions.push(this.createFeeInstruction(+swapAmountInLamports, traderProfile.wallet.publicKey, currency));

            if (currency == Currency.SOL){
                swap.value = {
                    sol: +swapAmountInLamports / LAMPORTS_PER_SOL,
                    usd : Math.round((+swapAmountInLamports / LAMPORTS_PER_SOL) * TokenManager.getSolPrice() * 100) / 100,
                }
            }
            else if (currency == Currency.USDC){
                swap.value = {
                    sol: Math.round(+swapAmountInLamports * 1000 / TokenManager.getSolPrice()) / 1000000000, // 10**6 / 10**9
                    usd: +swapAmountInLamports / (10 ** 6),
                }
            }
            await Swap.updateOne({ _id: swap._id }, { $set: { value: swap.value } });
            
            LogManager.log('SwapManager', 'instructions.length =', instructions.length);

            blockhash = (await SolanaManager.getRecentBlockhash()).blockhash;
            const tx = await SolanaManager.createVersionedTransaction(instructions, keypair, addressLookupTableAccounts, blockhash, false)
            LogManager.log('SwapManager', 'tx', tx);

            signature = await stakedConnection.sendTransaction(tx, { skipPreflight: true, maxRetries: 0 });
            LogManager.log('SwapManager', 'signature', signature);
        }
        catch (error) {
            console.error('SwapManager', type, error);

            if (triesLeft <= 0) {
                swap.status.type = StatusType.CREATED;
                swap.status.tryIndex++;
                await Swap.updateOne({ _id: swap._id, 'status.type': StatusType.START_PROCESSING }, { $set: { status: swap.status } });

                return;
            }

            // repeat the transaction            
            return type == SwapType.BUY ? await this.buy(swap, traderProfile, triesLeft - 1) : await this.sell(swap, traderProfile, triesLeft - 1);
        }

        swap.status.type = StatusType.PROCESSING;
        swap.status.tryIndex++;
        swap.status.tx = {
            signature,
            blockhash,
            sentAt: new Date(),
        };
        if (!swap.status.txs) { swap.status.txs = []; };
        swap.status.txs.push(swap.status.tx);
        await Swap.updateOne({ _id: swap._id }, { $set: { status: swap.status } });

        return signature;
    }

    static createFeeInstruction(swapAmountInLamports: number, walletAddress: string, currency = Currency.SOL, fee = 0.01): web3.TransactionInstruction {
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

    static async receivedConfirmationForSignature(signature: string) {
        const swap = await Swap.findOne({ "status.tx.signature": signature });
        if (!swap) {
            // LogManager.error('SwapManager', 'receivedConfirmation', 'Swap not found', { signature });
            return;
        }

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

        await Swap.updateOne({ _id: swap._id }, { $set: { status: swap.status } });
        this.trackSwapInMixpanel(swap);
    }

    static async checkPendingSwaps() {
        const swaps = await Swap.find({ "status.type": StatusType.PROCESSING });
        LogManager.log('SwapManager', 'checkPendingSwaps', 'Pending swaps:', swaps.length);
        if (!swaps || swaps.length === 0) {
            return;
        }

        const blockhashes: string[] = [];
        const signatures = swaps.map(swap => swap.status.tx?.signature).filter(signature => signature) as string[];

        if (signatures.length === 0) {
            return;
        }

        const connection = newConnection();
        const signatureStatuses = await connection.getSignatureStatuses(signatures);

        for (let index = 0; index < signatures.length; index++) {
            const signature = signatures[index];
            const signatureStatus = signatureStatuses.value[index];
            const swap = swaps.find(swap => swap.status.tx?.signature == signature);
            if (!swap) {
                console.error('SwapManager', 'checkPendingSwaps', 'Swap not found', { signature });
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
                    console.error('SwapManager', 'checkPendingSwaps', signatureStatus.err);
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
                    await Swap.updateOne({ _id: swap._id }, { $set: { status: swap.status } });
                    this.trackSwapInMixpanel(swap);
                }
            }
        }

        // fetch blockhashes statusses
        for (const blockhash of blockhashes) {
            const isValid = await SolanaManager.isBlockhashValid(blockhash);
            if (isValid) {
                continue;
            }
            else if (isValid == false){
                // then set status from PENDING to CREATED 
                for (const swap of swaps) {
                    if (swap.status.tx?.blockhash == blockhash && swap.status.type == StatusType.PROCESSING) {
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
                    await this.sendSwapErrorToUser(swap);
                    continue;
                }
            }

            const traderProfile = await TraderProfilesManager.findById(swap.traderProfileId);
            if (traderProfile) {
                if (swap.type === SwapType.BUY) {
                    await this.buy(swap, traderProfile);
                }
                else {
                    await this.sell(swap, traderProfile);
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

        const token = await TokenManager.getToken(swap.mint);

        let internalMessage = `${swap.type} tx`;
        if (token){
            const bnAmount = new BN(swap.amountIn);
            const bnDecimalsAmount = swap.type == SwapType.BUY ? new BN(10**9) : new BN(10 ** (token.decimals || 0))
            const { div, mod } = bnAmount.divmod(bnDecimalsAmount);
            const amountIn = div.toString() + (mod.eqn(0) ? '' : '.' + mod.toString());

            const actionString = swap.type == SwapType.BUY 
                ? `buy ${token.symbol} for ${Helpers.prettyNumberFromString(amountIn, 6)} SOL` 
                : `sell ${Helpers.prettyNumberFromString(amountIn, 6)} ${token.symbol}`;
            internalMessage = `tx to ${actionString}`
        }
        const message = `We tried to process your ${internalMessage}, but it failed every time. Check that your trader wallet is funded, double check your slippage, and try again.`

        const userTx = new UserTransaction();
        userTx.geyserId = 'manual';
        userTx.userId = swap.userId;
        userTx.title = swap.type == SwapType.BUY ? 'BUY ERROR' : 'SELL ERROR';
        userTx.description = message;
        userTx.createdAt = new Date();
        userTx.tokens = token ? [token] : [];
        userTx.signature = `manual_${swap.userId}_${Date.now()}`;

        let addedTx: boolean = false;
        try {
            addedTx = await RedisManager.saveUserTransaction(userTx);
            // LogManager.forceLog('addedToRedis:', addedTx);  
        }
        catch (err: any) {
            addedTx = true;
            await userTx.save();
            LogManager.error('WalletManager', 'processTxForChats', 'Error saving to Redis:', err);
            SystemNotificationsManager.sendSystemMessage('🔴🔴🔴 Error saving to Redis: ' + err.message);
        }

        if (addedTx){
            let isTelegramSent = false;
            if (user.telegram?.id){
                BotManager.sendMessage({ 
                    chatId: user.telegram?.id, 
                    text: message, 
                });
                isTelegramSent = true;
            }
    
            let isPushSent = await FirebaseManager.sendPushToUser(swap.userId, `[SWAP ERROR]`, message, undefined, { open: 'transactions' });
    
            MixpanelManager.trackError(swap.userId, { text: message });    
        }
    }

    static async trackSwapInMixpanel(swap: ISwap) {
        const solValue = swap.value?.sol || 0;
        const usdValue = swap.value?.usd || 0;

        MixpanelManager.track(`Swap`, swap.userId, { 
            type: swap.type,
            traderProfileId: swap.traderProfileId,
            dex: swap.dex,
            mint: swap.mint,
            solValue,
            usdValue,
        });
    }

}