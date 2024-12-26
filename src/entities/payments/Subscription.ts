import * as mongoose from 'mongoose';
import { Environment, Status } from "@apple/app-store-server-library"

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export enum SubscriptionTier {
    SILVER = 'silver',
    GOLD = 'gold',
    PLATINUM = 'platinum',
}

export enum SubscriptionStatus {
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
}

export enum SubscriptionPlatform {
    REVENUECAT = 'REVENUECAT',
    SOLANA = 'SOLANA',
    GIFT_CARD = 'GIFT_CARD',
}

export interface ISubscription extends mongoose.Document {
    userId: string;
    tier: SubscriptionTier;
    status: SubscriptionStatus;
    platform: SubscriptionPlatform;
    expiresAt: Date;
    updatedAt?: Date;
    createdAt: Date;
}

export const SubscriptionSchema = new mongoose.Schema<ISubscription>({
    userId: { type: String },
    tier: { type: String, enum: Object.values(SubscriptionTier) },
    status: { type: String, enum: Object.values(SubscriptionStatus) },
    platform: { type: String, enum: Object.values(SubscriptionPlatform) },
    expiresAt: { type: Date },
    updatedAt: { type: Date, default: new Date() },
    createdAt: { type: Date, default: new Date() }
});

SubscriptionSchema.index({ userId: 1, status: 1 });
SubscriptionSchema.index({ userId: 1, platform: 1, createdAt: 1 });
SubscriptionSchema.index({ userId: 1, platform: 1, status: 1 });
SubscriptionSchema.index({ platform: 1, expiresAt: 1 });

SubscriptionSchema.pre('save', function (next) {
    this.updatedAt = new Date();

    return next();
});

SubscriptionSchema.methods.toJSON = function () {
    return {
        tier: this.tier,
        platform: this.platform,
        expiresAt: this.expiresAt,
    };
};

export const Subscription = mongoose.model<ISubscription>('subscriptions', SubscriptionSchema);