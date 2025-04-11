import * as mongoose from 'mongoose';
import { Chain } from '../../services/solana/types';
import { Currency } from '../../models/types';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface IUserRefReward extends mongoose.Document {
    userId: string;
    swapId: string;
    chain: Chain;
    currency: Currency;
    amount: number; // lamports
    usdAmount?: number; // USD amount
    createdAt: Date;
}

export const UserRefRewardSchema = new mongoose.Schema<IUserRefReward>({
    userId: { type: String },
    swapId: { type: String },
    chain: { type: String },
    currency: { type: String },
    amount: { type: Number },
    usdAmount: { type: Number },
    createdAt: { type: Date, default: new Date() }
});

UserRefRewardSchema.index({ userId: 1 });
UserRefRewardSchema.index({ userId: 1, chain: 1 });

export const UserRefReward = mongoose.model<IUserRefReward>('users-ref-rewards', UserRefRewardSchema);