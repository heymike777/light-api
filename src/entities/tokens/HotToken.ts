import * as mongoose from 'mongoose';
import { Chain, DexId, TimeBasedValue } from '../../services/solana/types';
import { SwapDex } from '../payments/Swap';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface IHotTokenModel {
    chain: Chain;
    mint: string;
    symbol: string;
    sort?: number;
    volume?: TimeBasedValue;
    isFeatured?: boolean;
}

export interface IHotToken extends mongoose.Document {
    chain: Chain;
    mint: string;
    symbol: string;
    sort: number;
    volume?: TimeBasedValue;
    isFeatured?: boolean;

    updatedAt?: Date;
    createdAt?: Date;
}

export const HotTokenSchema = new mongoose.Schema<IHotToken>({
    chain: { type: String },
    mint: { type: String  },
    symbol: { type: String },
    sort: { type: Number, default: 100 },
    volume: { type: Mixed },
    isFeatured: { type: Boolean, default: false },

    updatedAt: { type: Date, default: new Date() },
    createdAt: { type: Date, default: new Date() }
});

HotTokenSchema.index({ chain: 1, sort: 1 });
HotTokenSchema.index({ chain: 1 });

HotTokenSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    return next();
});

HotTokenSchema.methods.toJSON = function () {
    return {
        id: this._id,
    };
};

export const HotToken = mongoose.model<IHotToken>('tokens-hot', HotTokenSchema);