import * as mongoose from 'mongoose';
import { PriorityFee } from '../../models/types';
import { WalletModel } from '../../services/solana/types';
import { SwapManager } from '../../managers/SwapManager';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface IUserTraderProfile extends mongoose.Document {
    userId: string;
    engineId: string;
    title: string;
    default: boolean;
    active: boolean;

    // only for Light engine
    wallet?: WalletModel;
    defaultAmount?: number;
    priorityFee?: PriorityFee;
    slippage?: number;

    updatedAt?: Date;
    createdAt: Date;
}

export const UserTraderProfileSchema = new mongoose.Schema<IUserTraderProfile>({
    userId: { type: String },
    engineId: { type: String },
    title: { type: String },
    default: { type: Boolean, default: false },
    active: { type: Boolean, default: true },

    wallet: { type: Mixed },
    defaultAmount: { type: Number },
    priorityFee: { type: String },
    slippage: { type: Number },

    updatedAt: { type: Date, default: new Date() },
    createdAt: { type: Date, default: new Date() }
});

UserTraderProfileSchema.index({ userId: 1, active: 1 });
UserTraderProfileSchema.index({ engineId: 1, active: 1 });

UserTraderProfileSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    return next();
});

UserTraderProfileSchema.methods.toJSON = function () {
    return {
        id: this._id,
        userId: this.userId,
        title: this.title,
        defaultAmount: this.defaultAmount,
        priorityFee: this.priorityFee,
        slippage: this.slippage,
        engine: SwapManager.engines.find(e => e.id === this.engineId),
        walletAddress: this.wallet?.publicKey,
        default: this.default,
    };
};

export const UserTraderProfile = mongoose.model<IUserTraderProfile>('users-trader-profiles', UserTraderProfileSchema);