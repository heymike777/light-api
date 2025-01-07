import * as mongoose from 'mongoose';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export enum SwapType {
    BUY = 'buy',
    SELL = 'sell',
}

export enum StatusType {
    CREATED = 'created',
    PENDING = 'pending',
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

export interface SwapDex {
    JUPITER: 'jupiter',
}

export interface ISwap extends mongoose.Document {
    userId: string;
    traderProfileId: string;
    type: SwapType;
    dex: SwapDex;
    mint: string;
    amountIn: number; // lamports
    
    status: {
        type: StatusType;
        tx?: SentTx;
        txs?: SentTx[];    
    }

    updatedAt?: Date;
    createdAt: Date;
}

export const SwapSchema = new mongoose.Schema<ISwap>({
    userId: { type: String },
    traderProfileId: { type: String },
    type: { type: String },
    dex: { type: String },
    mint: { type: String },
    amountIn: { type: Number },
    
    status: {
        type: { type: String, enum: Object.values(StatusType) },
        tx: {
            blockhash: { type: String },
            signature: { type: String },
        },
        txs: [{
            blockhash: { type: String },
            signature: { type: String },
        }]
    },

    updatedAt: { type: Date, default: new Date() },
    createdAt: { type: Date, default: new Date() }
});

SwapSchema.index({ userId: 1 });
SwapSchema.index({ "status.tx.signature": 1 });

SwapSchema.pre('save', function (next) {
    this.updatedAt = new Date();

    return next();
});

SwapSchema.methods.toJSON = function () {
    return {
        
    };
};

export const Swap = mongoose.model<ISwap>('swaps', SwapSchema);