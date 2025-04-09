import * as mongoose from 'mongoose';
import { EncryptedWalletModel, Priority, WalletModel } from '../../services/solana/types';
import { SwapManager } from '../../managers/SwapManager';
import { Currency } from '../../models/types';
import { EncryptionManager } from '../../managers/EncryptionManager';
import { EnvManager } from '../../managers/EnvManager';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface IUserTraderProfile extends mongoose.Document {
    userId: string;
    engineId: string;
    title: string;
    default: boolean;
    active: boolean;
    priorityFee: Priority;

    // only for Light engine
    
    // wallet?: WalletModel;
    encryptedWallet?: EncryptedWalletModel;

    defaultAmount?: number;// in SOL / USDC (for mobile app. telegram bot uses buyAmounts)
    buySlippage?: number;// in percents
    sellSlippage?: number;// in percents
    currency?: Currency;// USDC or SOL
    buyAmounts?: number[];// in SOL / USDC
    sellAmounts?: number[];// in percents

    updatedAt?: Date;
    createdAt: Date;

    getWallet(): WalletModel | undefined;
}

export const UserTraderProfileSchema = new mongoose.Schema<IUserTraderProfile>({
    userId: { type: String },
    engineId: { type: String },
    title: { type: String },
    default: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    priorityFee: { type: String },

    // wallet: { type: Mixed },
    encryptedWallet: { type: Mixed },

    defaultAmount: { type: Number },
    buySlippage: { type: Number },
    sellSlippage: { type: Number },
    currency: { type: String, default: Currency.SOL },
    buyAmounts: { type: [Number], default: [0.5, 1] },
    sellAmounts: { type: [Number], default: [25, 50, 100] },

    updatedAt: { type: Date, default: new Date() },
    createdAt: { type: Date, default: new Date() }
});

UserTraderProfileSchema.index({ userId: 1, active: 1 });
UserTraderProfileSchema.index({ engineId: 1, active: 1 });
UserTraderProfileSchema.index({ userId: 1, _id: 1 });
UserTraderProfileSchema.index({ userId: 1, _id: 1, default: 1 });
UserTraderProfileSchema.index({ userId: 1 });
UserTraderProfileSchema.index({ userId: 1, engineId: 1, active: 1 });
// UserTraderProfileSchema.index({ userId: 1, "wallet.publicKey": 1, active: 1 });
UserTraderProfileSchema.index({ userId: 1, "encryptedWallet.publicKey": 1, active: 1 });

UserTraderProfileSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    return next();
});

UserTraderProfileSchema.methods.toJSON = function () {
    return {
        id: this._id,
        userId: this.userId,
        title: this.title,
        defaultAmount: this.defaultAmount,
        engine: SwapManager.engines.find(e => e.id === this.engineId),
        walletAddress: this.encryptedWallet?.publicKey,
        default: this.default,
        slippage: this.buySlippage,
        buySlippage: this.buySlippage,
        sellSlippage: this.sellSlippage,
        currency: this.currency,
        buyAmounts: this.buyAmounts,
        sellAmounts: this.sellAmounts,
        priorityFee: this.priorityFee,
    };
};

UserTraderProfileSchema.methods.getWallet = function () {
   if (this.encryptedWallet) {
        return {
            publicKey: this.encryptedWallet.publicKey,
            privateKey: EncryptionManager.decryptPrivateKey(this.encryptedWallet.data, this.encryptedWallet.iv, this.encryptedWallet.tag, EnvManager.getWalletEncryptionKey()),
        }
    }
    return undefined;
};

export const UserTraderProfile = mongoose.model<IUserTraderProfile>('users-trader-profiles', UserTraderProfileSchema);