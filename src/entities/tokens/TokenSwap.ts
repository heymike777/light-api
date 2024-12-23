import * as mongoose from 'mongoose';
import { Chain, DexId } from '../../services/solana/types';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface ITokenSwap extends mongoose.Document {
    chain: Chain;
    dexId: DexId;
    pairAddress: string;
    signature: string;
    ixIndex: number;
    from: {
        mint: string;
        amount: string;
    };
    to: {
        mint: string;
        amount: string;
    };

    updatedAt?: Date;
    createdAt?: Date;
}

export const TokenSwapSchema = new mongoose.Schema<ITokenSwap>({
    chain: { type: String },
    dexId: { type: String },
    pairAddress: { type: String },
    signature: { type: String },
    ixIndex: { type: Number },
    from: {
        mint: { type: String },
        amount: { type: String },
    },
    to: {
        mint: { type: String },
        amount: { type: String },
    },

    updatedAt: { type: Date, default: new Date() },
    createdAt: { type: Date, default: new Date() }
});

TokenSwapSchema.index({ signature: 1, ixIndex: 1 }, { unique: true });
TokenSwapSchema.index({ createdAt: 1 });

TokenSwapSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    return next();
});

TokenSwapSchema.methods.toJSON = function () {
    return {
        id: this._id,
        chain: this.chain,
    };
};

export const TokenSwap = mongoose.model<ITokenSwap>('tokens-swaps', TokenSwapSchema);