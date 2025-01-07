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

    static async buy(swap: ISwap, traderProfile: IUserTraderProfile): Promise<string | undefined> {
        if (!traderProfile.wallet){
            return;
        }
        const mint = swap.mint;
        const amount = swap.amountIn;

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
        const connection = newConnection();
        const addressLookupTableAccounts = await SolanaManager.getAddressLookupTableAccounts(connection, addressLookupTableAddresses);

        console.log('SwapManager', 'swapData', swapData);

        // add 0.75% fee instruction to tx
        instructions.push(this.createFeeInstruction(amount, traderProfile.wallet.publicKey));
        
        console.log('SwapManager', 'instructions.length =', instructions.length);

        const blockhash = (await SolanaManager.getRecentBlockhash()).blockhash;
        const keypair = web3.Keypair.fromSecretKey(bs58.decode(traderProfile.wallet.privateKey));
        const tx = await SolanaManager.createVersionedTransaction(instructions, keypair, addressLookupTableAccounts, blockhash, false)
        console.log('SwapManager', 'tx', tx);

        const stakedConnection = newConnection(process.env.HELIUS_STAKED_CONNECTIONS_URL!);
        const signature = await stakedConnection.sendTransaction(tx, { skipPreflight: false, maxRetries: 0 });
        console.log('SwapManager', 'signature', signature);

        swap.status.type = StatusType.PENDING;
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

}