import * as mongoose from 'mongoose';
import { SubscriptionTier } from '../payments/Subscription';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface IGiftCardClaim extends mongoose.Document {
    cardId: string;
    userId: string;
    startAt: Date;
    endAt: Date;

    updatedAt?: Date;
    createdAt: Date;
}

export const GiftCardClaimSchema = new mongoose.Schema<IGiftCardClaim>({
    cardId: { type: String },
    userId: { type: String },
    startAt: { type: Date },
    endAt: { type: Date },

    updatedAt: { type: Date, default: new Date() },
    createdAt: { type: Date, default: new Date() }
});

GiftCardClaimSchema.index({ cardId: 1, userId: 1 }, { unique: true });
GiftCardClaimSchema.index({ cardId: 1 });
GiftCardClaimSchema.index({ userId: 1, createdAt: -1 });

GiftCardClaimSchema.pre('save', function (next) {
    this.updatedAt = new Date();

    return next();
});

GiftCardClaimSchema.methods.toJSON = function () {
    return {
        id: this._id,
    };
};

export const GiftCardClaim = mongoose.model<IGiftCardClaim>('gift-cards-claims', GiftCardClaimSchema);