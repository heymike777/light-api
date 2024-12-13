import * as mongoose from 'mongoose';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export enum WalletStatus {
    ACTIVE = 'active',
    PAUSED = 'paused',
}

export interface IWallet extends mongoose.Document {
    userId: string;
    walletAddress: string;
    title?: string;
    isVerified: boolean;
    status: WalletStatus;

    updatedAt?: Date;
    createdAt: Date;
}

export const WalletSchema = new mongoose.Schema<IWallet>({
    userId: { type: String },
    walletAddress: { type: String },
    title: { type: String },
    isVerified: { type: Boolean, default: false },
    status: { type: String, enum: Object.values(WalletStatus), default: WalletStatus.ACTIVE },

    updatedAt: { type: Date, default: new Date() },
    createdAt: { type: Date, default: new Date() }
});

WalletSchema.index({ userId: 1 });
WalletSchema.index({ userId: 1, wallletAddress: 1 });
WalletSchema.index({ userId: 1, status: 1 });
WalletSchema.index({ status: 1 });

WalletSchema.pre('save', function (next) {
    this.updatedAt = new Date();

    return next();
});

WalletSchema.methods.toJSON = function () {
    return {
        id: this.id,
        walletAddress: this.walletAddress,
        title: this.status === WalletStatus.PAUSED ? ((this.title || '') + ' (paused)').trim() : this.title,
        status: this.status,
    };
};

export const Wallet = mongoose.model<IWallet>('wallets', WalletSchema);