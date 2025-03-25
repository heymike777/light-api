import * as mongoose from 'mongoose';
import { Chain, DexId } from '../../services/solana/types';
import { SwapDex } from '../payments/Swap';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface ILpMint extends mongoose.Document {
    chain: Chain;
    dex: SwapDex;

    pairAddress: string;
    token1: string;
    token2: string;
    lpMint: string

    updatedAt?: Date;
    createdAt?: Date;
}

export const LpMintSchema = new mongoose.Schema<ILpMint>({
    chain: { type: String },
    dex: { type: String },

    pairAddress: { type: String },
    token1: { type: String },
    token2: { type: String },
    lpMint: { type: String },

    updatedAt: { type: Date, default: new Date() },
    createdAt: { type: Date, default: new Date() }
});

LpMintSchema.index({ chain: 1, lpMint: 1 }, { unique: true });
LpMintSchema.index({ chain: 1, dex: 1, token1: 1 });
LpMintSchema.index({ chain: 1, dex: 1, token2: 1 });

LpMintSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    return next();
});

LpMintSchema.methods.toJSON = function () {
    return {
        id: this._id,
    };
};

export const LpMint = mongoose.model<ILpMint>('lp-mints', LpMintSchema);