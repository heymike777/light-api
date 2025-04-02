import * as mongoose from 'mongoose';
import { Chain, DexId } from '../../services/solana/types';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface ITokenPair extends mongoose.Document {
    chain: Chain;
    programId?: string;
    // dexId: DexId;
    pairAddress: string;
    token1: string;
    token2: string;
    tokenAccount1?: string;
    tokenAccount2?: string;
    lpMint?: string;

    liquidity: {
        token1: {
            amount: string;
            uiAmount: number;
            decimals: number;
        };
        token2: {
            amount: string;
            uiAmount: number;
            decimals: number;
        };
    };

    updatedAt?: Date;
    createdAt?: Date;
}

export const TokenPairSchema = new mongoose.Schema<ITokenPair>({
    chain: { type: String },
    programId: { type: String },
    // dexId: { type: String },
    pairAddress: { type: String },
    token1: { type: String },
    token2: { type: String },
    tokenAccount1: { type: String },
    tokenAccount2: { type: String },
    lpMint: { type: String },
    
    liquidity: {
        token1: {
            amount: { type: String },
            uiAmount: { type: Number },
            decimals: { type: Number },
        },
        token2: {
            amount: { type: String },
            uiAmount: { type: Number },
            decimals: { type: Number },
        },
        updatedAt: { type: Date },
    },

    updatedAt: { type: Date, default: new Date() },
    createdAt: { type: Date, default: new Date() }
});

TokenPairSchema.index({ chain: 1, pairAddress: 1 }, { unique: true });
TokenPairSchema.index({ token1: 1 });
TokenPairSchema.index({ token2: 1 });
TokenPairSchema.index({ chain: 1, token1: 1 });
TokenPairSchema.index({ chain: 1, token2: 1 });
TokenPairSchema.index({ chain: 1, token1: 1, token2: 1 });
TokenPairSchema.index({ updatedAt: 1 });
TokenPairSchema.index({ pairAddress: 1 });
TokenPairSchema.index({ chain: 1 });

TokenPairSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    return next();
});

TokenPairSchema.methods.toJSON = function () {
    return {
        id: this._id,
        chain: this.chain,
    };
};

export const TokenPair = mongoose.model<ITokenPair>('tokens-pairs', TokenPairSchema);