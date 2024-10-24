import * as mongoose from 'mongoose';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface SubscriptionRenewData {
    transactionId: string;
    originalTransactionId: string;
    webOrderLineItemId: string;
    bundleId: string;
    productId: string;
    subscriptionGroupIdentifier: string;
    purchaseDate: number;
    originalPurchaseDate: number;
    expiresDate: number;
    quantity: number;
    type: string;
    inAppOwnershipType: string;
    signedDate: number;
    environment: string;
    transactionReason: string;
    storefront: string;
    storefrontId: string;
    price: number;
    currency: string;
}

export default interface IAppleLog extends mongoose.Document {
    userId: string;
    originalTransactionId?: string;
    expiresDate: Date;
    data: any;
    createdAt: Date;
}

export const AppleLogSchema = new mongoose.Schema<IAppleLog>({
    userId: { type: String },
    originalTransactionId: { type: String },
    expiresDate: { type: Date },
    data: { type: Mixed },
    createdAt: { type: Date, default: new Date() }
});

AppleLogSchema.index({ 'originalTransactionId': 1 });

AppleLogSchema.methods.toJSON = function () {
    return {
        id: this._id,
        userId: this.userId,
        originalTransactionId: this.originalTransactionId,
        data: this.data,
        createdAt: this.createdAt,
    };
};

export const AppleLog = mongoose.model<IAppleLog>('subscriptions-ios-logs', AppleLogSchema);