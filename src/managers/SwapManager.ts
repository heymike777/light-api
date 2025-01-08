import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { IUserTraderProfile } from "../entities/users/TraderProfile";
import { kSolAddress } from "../services/solana/Constants";
import { Engine } from "../services/solana/types";
import { JupiterManager } from "./JupiterManager";
import { QuoteGetSwapModeEnum } from "@jup-ag/api";
import { BadRequestError } from "../errors/BadRequestError";
import * as web3 from "@solana/web3.js";
import { HeliusManager } from "../services/solana/HeliusManager";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { newConnection } from "../services/solana/lib/solana";
import { SolanaManager } from "../services/solana/SolanaManager";
import { ISwap, StatusType, Swap } from "../entities/payments/Swap";
import { LogManager } from "./LogManager";

export class SwapManager {

    static kDefaultEngineId = 'bonkbot';
    static kNaviteEngineId = 'light';
    static engines: Engine[] = [
        {
            id: this.kNaviteEngineId,
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
        // {
        //     id: 'trojan',
        //     title: 'Trojan',
        //     logo: 'https://light.dangervalley.com/static/trojan.png',
        //     url: '',
        //     tokenUrl: '',
        //     isSubscriptionRequired: true,
        //     isExternal: true,
        // },
        // {
        //     id: 'bananagun',
        //     title: 'BananaGun',
        //     logo: 'https://light.dangervalley.com/static/bananagun.png',
        //     url: '',
        //     tokenUrl: '',
        //     isSubscriptionRequired: true,
        //     isExternal: true,
        // },
    ];

    static async buy(swap: ISwap, traderProfile: IUserTraderProfile, triesLeft: number = 10): Promise<string | undefined> {
        swap.status.type = StatusType.START_PROCESSING;
        const res = await Swap.updateOne({ _id: swap._id, "swap.status.type": StatusType.CREATED }, { $set: { status: swap.status } });
        if (res.modifiedCount === 0) {
            LogManager.error('SwapManager', 'buy', 'Swap status is not CREATED', { swap });
            return;
        }

        if (!traderProfile.wallet){
            LogManager.error('SwapManager', 'buy', 'Trader profile wallet not found', { traderProfile });
            return;
        }
        const mint = swap.mint;
        const amount = swap.amountIn;

        const stakedConnection = newConnection(process.env.HELIUS_STAKED_CONNECTIONS_URL!);
        const keypair = web3.Keypair.fromSecretKey(bs58.decode(traderProfile.wallet.privateKey));
        const connection = newConnection();
        let signature: string | undefined;
        let blockhash: string | undefined

        try {
            const quote = await JupiterManager.getQuote(kSolAddress, mint, amount * LAMPORTS_PER_SOL, traderProfile.slippage || 10, QuoteGetSwapModeEnum.ExactIn);
            if (!quote) {
                return;
            }

            console.log('SwapManager', 'quote', quote);

            const prioritizationFeeLamports = await HeliusManager.getRecentPrioritizationFees();

            const swapData = await JupiterManager.swapInstructions(quote.quoteResponse, traderProfile.wallet.publicKey, traderProfile.slippage || 10, prioritizationFeeLamports, {
                includeTokenLedgerInstruction: true,
                includeSwapInstruction: true,
                includeComputeBudgetInstructions: true,
                includeCleanupInstruction: true,
                includeSetupInstructions: true,
            });

            const instructions = swapData.instructions;
            const addressLookupTableAddresses = swapData.addressLookupTableAddresses;
            const addressLookupTableAccounts = await SolanaManager.getAddressLookupTableAccounts(connection, addressLookupTableAddresses);

            console.log('SwapManager', 'swapData', swapData);

            // add 0.75% fee instruction to tx
            instructions.push(this.createFeeInstruction(amount, traderProfile.wallet.publicKey));
            
            console.log('SwapManager', 'instructions.length =', instructions.length);

            blockhash = (await SolanaManager.getRecentBlockhash()).blockhash;
            const tx = await SolanaManager.createVersionedTransaction(instructions, keypair, addressLookupTableAccounts, blockhash, false)
            console.log('SwapManager', 'tx', tx);

            signature = await stakedConnection.sendTransaction(tx, { skipPreflight: false, maxRetries: 0 });
            console.log('SwapManager', 'signature', signature);
        }
        catch (error) {
            console.error('SwapManager', 'buy', error);

            if (triesLeft <= 0) {
                swap.status.type = StatusType.CREATED;
                swap.status.tryIndex++;
                await Swap.updateOne({ _id: swap._id }, { $set: { status: swap.status } });
                return;
            }

            // repeat the transaction            
            return await this.buy(swap, traderProfile, triesLeft - 1);
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

    static createFeeInstruction(swapAmount: number, walletAddress: string): web3.TransactionInstruction {
        const feeWalletAddress = process.env.FEE_SOL_WALLET_ADDRESS;
        if (!feeWalletAddress) {
            throw new BadRequestError('Fee wallet address not found');
        }

        const feeAmount = Math.round(swapAmount * LAMPORTS_PER_SOL * 0.0075);
        const feeInstruction = web3.SystemProgram.transfer({
            fromPubkey: new web3.PublicKey(walletAddress),
            toPubkey: new web3.PublicKey(feeWalletAddress),
            lamports: feeAmount,
        });

        return feeInstruction;
    }

    static async receivedConfirmationForSignature(signature: string) {
        const swap = await Swap.findOne({ "status.tx.signature": signature });
        if (!swap) {
            LogManager.error('SwapManager', 'receivedConfirmation', 'Swap not found', { signature });
            return;
        }

        const now = new Date();

        swap.status.type = StatusType.COMPLETED;
        if (swap.status.tx && swap.status.tx.signature == signature) {
            swap.status.tx.confirmedAt = new Date();
        }
        else {
            LogManager.error('SwapManager', 'receivedConfirmation', 'Tx not found', { signature });
        }

        if (swap.status.txs){
            for (const tx of swap.status.txs) {
                if (tx.signature == signature) {
                    tx.confirmedAt = now;
                }
            }
        }

        await Swap.updateOne({ _id: swap._id }, { $set: { status: swap.status } });
    }

}