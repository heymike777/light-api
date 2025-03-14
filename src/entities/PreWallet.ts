import * as mongoose from 'mongoose';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface IPreWallet extends mongoose.Document {
    publicKey: string;
    privateKey: string;
    isUsed: boolean;
    updatedAt?: Date;
    createdAt: Date;
}

export const PreWalletSchema = new mongoose.Schema<IPreWallet>({
    publicKey: { type: String },
    privateKey: { type: String },
    isUsed: { type: Boolean, default: false },

    updatedAt: { type: Date, default: new Date() },
    createdAt: { type: Date, default: new Date() }
});

PreWalletSchema.index({ publicKey: 1 }, { unique: true });
PreWalletSchema.index({ isUsed: 1 });

PreWalletSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    return next();
});


export const PreWallet = mongoose.model<IPreWallet>('pre-wallets', PreWalletSchema);