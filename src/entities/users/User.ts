import * as mongoose from 'mongoose';
import { ISubscription, SubscriptionTier } from '../payments/Subscription';
import { SwapManager } from '../../managers/SwapManager';
import { IUserTraderProfile } from './TraderProfile';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface TelegramUser {
    id: number;
    is_bot: boolean;
    first_name?: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    is_premium?: boolean;
}

export enum TelegramWaitingType {
    EMAIL = 'email',
    EMAIL_VERIFICATION_CODE = 'email_verification_code',
    ADD_WALLET = 'add_wallet',
    REMOVE_WALLET = 'remove_wallet',
    TRADER_EDIT_NAME = 'trader_edit_name',
    BUY_AMOUNT = 'buy_amount',
    SELL_AMOUNT = 'SELL_amount',
}

export interface TelegramState {
    waitingFor?: TelegramWaitingType;
    data?: any;
    helper?: string;
}

export enum UserBotStatus {
    ACTIVE = 'active',
    BLOCKED = 'blocked',
}

export interface IUser extends mongoose.Document {
    email?: string;
    telegram?: TelegramUser;
    telegramOld?: TelegramUser;
    referralCode?: string;
    lastIpAddress?: string;
    isAdmin?: boolean;
    usedGiftCardsCount?: number;
    engine?: string;
    telegramState?: TelegramState;

    defaultBot?: string;
    bots?: {[key: string]: 'default' | 'active' | 'blocked'};

    updatedAt?: Date;
    createdAt: Date;

    // --- Relations ---
    subscription?: ISubscription;
    traderProfiles?: IUserTraderProfile[];
    maxNumberOfWallets?: number;
    maxNumberOfTraderProfiles?: number;
}

export const UserSchema = new mongoose.Schema<IUser>({
    email: { type: String },
    telegram: {
        id: { type: Number },
        is_bot: { type: Boolean },
        first_name: { type: String },
        last_name: { type: String },
        username: { type: String },
        language_code: { type: String },
        is_premium: { type: Boolean }
    },
    telegramOld: { type: Mixed },
    referralCode: { type: String },
    lastIpAddress: { type: String },
    isAdmin: { type: Boolean },
    usedGiftCardsCount: { type: Number },
    engine: { type: String },
    telegramState: {
        waitingFor: { type: String },
        data: { type: Mixed },
        helper: { type: String },
    },

    defaultBot: { type: String },
    bots: { type: Mixed },

    updatedAt: { type: Date, default: new Date() },
    createdAt: { type: Date, default: new Date() }
});

UserSchema.index({ 'telegram.id': 1 });
UserSchema.index({ 'email': 1 });

UserSchema.pre('save', function (next) {
    this.updatedAt = new Date();

    return next();
});

UserSchema.methods.toJSON = function () {
    return {
        id: this._id,
        email: this.email,
        subscription: this.subscription,
        maxNumberOfWallets: this.maxNumberOfWallets,
        maxNumberOfTraderProfiles: this.maxNumberOfTraderProfiles,
        isAdmin: this.isAdmin,
        usedGiftCardsCount: this.usedGiftCardsCount,
        engine: this.engine || SwapManager.kDefaultEngineId,
        traderProfiles: this.traderProfiles,
    };
};

export const User = mongoose.model<IUser>('users', UserSchema);