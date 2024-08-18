import * as mongoose from 'mongoose';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface IWallet extends mongoose.Document {
    chatId: number;
    walletAddress: string;
    title?: string;
    isVerified: boolean;

    updatedAt?: Date;
    createdAt: Date;
}

export const WalletSchema = new mongoose.Schema<IWallet>({
    chatId: { type: Number },
    walletAddress: { type: String },
    title: { type: String },
    isVerified: { type: Boolean, default: false },

    updatedAt: { type: Date, default: new Date() },
    createdAt: { type: Date, default: new Date() }
});

WalletSchema.index({ chatId: 1 });
WalletSchema.index({ chatId: 1, wallletAddress: 1 });

WalletSchema.pre('save', function (next) {
    this.updatedAt = new Date();

    return next();
});

WalletSchema.methods.toJSON = function () {
    return {
        id: this._id,
    };
};

export const Wallet = mongoose.model<IWallet>('wallets', WalletSchema);