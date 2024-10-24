import * as mongoose from 'mongoose';
import { Environment } from '../../services/solana/types';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export enum PaymentEnvironment {
    SANDBOX = 'SANDBOX',
    PRODUCTION = 'PRODUCTION',
}

export interface ISubscription extends mongoose.Document {
    userId: string;
    expiresDate: Date;
    isActive: boolean;
    ios?: {
        originalTransactionId: string;
        environment: PaymentEnvironment;
    };
    updatedAt?: Date;
    createdAt: Date;
}

export const SubscriptionSchema = new mongoose.Schema<ISubscription>({
    userId: { type: String },
    expiresDate: { type: Date },
    isActive: { type: Boolean },
    ios: {
        originalTransactionId: { type: String },
        environment: { type: String, enum: [PaymentEnvironment.SANDBOX, PaymentEnvironment.PRODUCTION] },
    },

    updatedAt: { type: Date, default: new Date() },
    createdAt: { type: Date, default: new Date() }
});

SubscriptionSchema.index({ userId: 1, isActive: 1 });
SubscriptionSchema.index({ 'ios.originalTransactionId': 1 });

SubscriptionSchema.pre('save', function (next) {
    this.updatedAt = new Date();

    return next();
});

SubscriptionSchema.methods.toJSON = function () {
    return {
        id: this._id,
        userId: this.userId,
        originalTransactionId: this.originalTransactionId,
        isActive: this.isActive,
        createdAt: this.createdAt,
    };
};

export const Subscription = mongoose.model<ISubscription>('subscriptions', SubscriptionSchema);