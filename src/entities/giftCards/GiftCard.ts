import * as mongoose from 'mongoose';
import { SubscriptionTier } from '../payments/Subscription';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface IGiftCard extends mongoose.Document {
    code: string;
    startAt: Date;
    endAt: Date;
    entries: number;
    referralCode?: string;

    subscription?: {
        tier: SubscriptionTier;
        days: number;
    };

    updatedAt?: Date;
    createdAt: Date;
}

export const GiftCardSchema = new mongoose.Schema<IGiftCard>({
    code: { type: String, unique: true },
    startAt: { type: Date },
    endAt: { type: Date },
    entries: { type: Number },
    referralCode: { type: String },

    subscription: {
        tier: { type: String },
        days: { type: Number },
    },

    updatedAt: { type: Date, default: new Date() },
    createdAt: { type: Date, default: new Date() }
});

GiftCardSchema.index({ code: 1, startAt: 1, endAt: 1 });
GiftCardSchema.index({ code: 1 }, { unique: true });

GiftCardSchema.pre('save', function (next) {
    this.updatedAt = new Date();

    return next();
});

GiftCardSchema.methods.toJSON = function () {
    return {
        id: this._id,
        code: this.code,
        startAt: this.startAt,
        endAt: this.endAt,
        subscription: this.subscription,
    };
};

export const GiftCard = mongoose.model<IGiftCard>('gift-cards', GiftCardSchema);