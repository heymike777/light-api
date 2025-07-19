import * as mongoose from 'mongoose';
import { ISubscription } from '../payments/Subscription';
import { SwapManager } from '../../managers/SwapManager';
import { IUserTraderProfile } from './TraderProfile';
import { Chain } from '../../services/solana/types';

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
    TRADER_PROFILE_EDIT_NAME = 'trader_profile_edit_name',
    TRADER_PROFILE_IMPORT_NAME = 'trader_profile_import_name',
    TRADER_PROFILE_IMPORT_PRIVATE_KEY = 'trader_profile_import_private_key',
    BUY_AMOUNT = 'buy_amount',
    SELL_AMOUNT = 'SELL_amount',
    SELL_LP_AMOUNT = 'SELL_LP_amount',
    ADD_REFCODE = 'add_refcode',
    AIRDROP_WALLETS = 'airdrop_wallets',
    EVENT_SPECIAL_PRIZE_INFO = 'event_special_prize_info',
    FARM_FREQUENCY = 'farm_frequency',
    FARM_VOLUME = 'farm_volume',
    FARM_TOKEN_CA = 'farm_token_ca',
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
    parent?: {
        userId: string;
        referralCode: string;
        createdAt: Date;
    }    
    lastIpAddress?: string;
    isAdmin?: boolean;
    usedGiftCardsCount?: number;
    engine?: string;
    telegramState?: TelegramState;

    defaultChain?: Chain;
    defaultBot?: string;
    bots?: {[key: string]: 'default' | 'active' | 'blocked'};
    volume?: {[key: string]: number}; // chain -> volume

    isAmbassador?: boolean;

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
    telegram: { type: Mixed },
    telegramOld: { type: Mixed },
    referralCode: { type: String },
    parent: { type: Mixed },
    lastIpAddress: { type: String },
    isAdmin: { type: Boolean },
    usedGiftCardsCount: { type: Number },
    engine: { type: String },
    telegramState: { type: Mixed },

    defaultChain: { type: String },
    defaultBot: { type: String },
    bots: { type: Mixed },
    volume: { type: Mixed },
    isAmbassador: { type: Boolean },

    updatedAt: { type: Date, default: new Date() },
    createdAt: { type: Date, default: new Date() }
});

UserSchema.index({ 'telegram.id': 1 });
UserSchema.index({ 'email': 1 });
UserSchema.index({ 'parent.userId': 1 });

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
        defaultChain: this.defaultChain,
    };
};

export const User = mongoose.model<IUser>('users', UserSchema);