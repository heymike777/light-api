import * as mongoose from 'mongoose';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface IAppleSubscription extends mongoose.Document {
    userId: string;
    originalTransactionId: string;
    isActive: boolean;
    updatedAt?: Date;
    createdAt: Date;
}

export const AppleSubscriptionSchema = new mongoose.Schema<IAppleSubscription>({
    userId: { type: String },
    originalTransactionId: { type: String },
    isActive: { type: Boolean },

    updatedAt: { type: Date, default: new Date() },
    createdAt: { type: Date, default: new Date() }
});

AppleSubscriptionSchema.index({ userId: 1, isActive: 1 });
AppleSubscriptionSchema.index({ originalTransactionId: 1 });

AppleSubscriptionSchema.pre('save', function (next) {
    this.updatedAt = new Date();

    return next();
});

AppleSubscriptionSchema.methods.toJSON = function () {
    return {
        id: this._id,
        userId: this.userId,
        originalTransactionId: this.originalTransactionId,
        isActive: this.isActive,
        createdAt: this.createdAt,
    };
};

export const AppleSubscription = mongoose.model<IAppleSubscription>('subscriptions-ios', AppleSubscriptionSchema);