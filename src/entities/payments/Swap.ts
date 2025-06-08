import * as mongoose from 'mongoose';
import { Currency } from '../../models/types';
import { Chain, WalletModel } from '../../services/solana/types';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export enum SwapType {
    BUY = 'buy',
    SELL = 'sell',
    BUY_HONEYPOT = 'buy_honeypot',
    SELL_HONEYPOT = 'sell_honeypot',
}

export enum StatusType {
    CREATED = 'created',
    START_PROCESSING = 'start_processing',
    PROCESSING = 'processing',
    COMPLETED = 'completed',
    CANCELLED = 'cancelled',
}

export interface SentTx {
    blockhash: string;
    signature: string;
    sentAt: Date;
    confirmedAt?: Date;
    updatedAt?: Date;
}

export enum SwapDex {
    JUPITER = 'jupiter',
    RAYDIUM_AMM = 'raydium_amm',
    SEGA = 'sega',
    COBALTX = 'cobaltx',
}

export interface ISwap extends mongoose.Document {
    chain: Chain;
    userId: string;
    traderProfileId: string;
    type: SwapType;
    dex: SwapDex;
    currency: Currency;
    mint: string;
    amountIn: string; // lamports
    amountPercents?: number;
    value?: {
        sol: number;
        usd: number;
    }
    intermediateWallet?: WalletModel;
    
    status: {
        type: StatusType;
        tryIndex: number;
        tx?: SentTx;
        txs?: SentTx[];    
    }

    referralRewards?: {
        fee: {
            sol?: number;
            usdc?: number;
            usd: number;
        },
        users: {
            [userId: string]: {
                sol?: number;
                usdc?: number;
                usd: number;
            }
        }
    }

    points?: { [eventId: string]: number }; // points for trading events, if any

    updatedAt?: Date;
    createdAt: Date;
}

export const SwapSchema = new mongoose.Schema<ISwap>({
    chain: { type: String },
    userId: { type: String },
    traderProfileId: { type: String },
    type: { type: String },
    dex: { type: String },
    currency: { type: String },
    mint: { type: String },
    amountIn: { type: String },
    amountPercents: { type: Number },
    value: { type: Mixed },
    intermediateWallet: { type: Mixed },
    status: { type: Mixed },
    referralRewards: { type: Mixed },
    points: { type: Mixed },

    updatedAt: { type: Date, default: new Date() },
    createdAt: { type: Date, default: new Date() }
});

SwapSchema.index({ userId: 1 });
SwapSchema.index({ chain: 1, 'status.tx.signature': 1 });
SwapSchema.index({ _id: 1, 'status.type': 1 });
SwapSchema.index({ traderProfileId: 1, 'status.type': 1, createdAt: 1, points: 1 });

SwapSchema.pre('save', function (next) {
    this.updatedAt = new Date();

    return next();
});

SwapSchema.methods.toJSON = function () {
    return {
        
    };
};

export const Swap = mongoose.model<ISwap>('swaps', SwapSchema);