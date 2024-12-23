import * as mongoose from 'mongoose';
import { Chain, DexId } from '../../services/solana/types';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface ITokenPair extends mongoose.Document {
    chain: Chain;
    dexId: DexId;
    pairAddress: string;
    mint: string;

    liquidity: {
        sol: string;
        token: string
    };

    updatedAt?: Date;
    createdAt?: Date;
}

export const TokenPairSchema = new mongoose.Schema<ITokenPair>({
    chain: { type: String },

    dexId: { type: String },
    pairAddress: { type: String },
    mint: { type: String },
    
    liquidity: {
        sol: { type: String },
        token: { type: String },
        updatedAt: { type: Date },
    },

    updatedAt: { type: Date, default: new Date() },
    createdAt: { type: Date, default: new Date() }
});

TokenPairSchema.index({ chain: 1, pairAddress: 1 }, { unique: true });
TokenPairSchema.index({ mint: 1 });

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