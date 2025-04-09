import * as mongoose from 'mongoose';
import { Currency } from '../../models/types';
import { Chain } from '../../services/solana/types';
import { StatusType } from '../payments/Swap';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;


export interface SentTx {
    blockhash: string;
    signature: string;
    sentAt: Date;
    confirmedAt?: Date;
    updatedAt?: Date;
}

export interface IUserRefPayout extends mongoose.Document {
    chain: Chain;
    userId: string;
    traderProfileId: string;
    currency: Currency;
    amount: number; // lamports
    status: {
        type: StatusType;
        tx?: SentTx;
    }

    updatedAt?: Date;
    createdAt: Date;
}

export const UserRefPayoutSchema = new mongoose.Schema<IUserRefPayout>({
    chain: { type: String },
    userId: { type: String },
    traderProfileId: { type: String },
    currency: { type: String },
    amount: { type: Number },
    status: { type: Mixed },
    updatedAt: { type: Date, default: new Date() },
    createdAt: { type: Date, default: new Date() }
});

UserRefPayoutSchema.index({ userId: 1 });
UserRefPayoutSchema.index({ userId: 1, 'status.type': 1 });

UserRefPayoutSchema.pre('save', function (next) {
    this.updatedAt = new Date();

    return next();
});

UserRefPayoutSchema.methods.toJSON = function () {
    return {};
};

export const UserRefPayout = mongoose.model<IUserRefPayout>('users-ref-payouts', UserRefPayoutSchema);