import * as mongoose from 'mongoose';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface TelegramUser {
    id: number;
    is_bot: boolean;
    first_name: string;
    last_name: string;
    username: string;
    language_code: string;
    is_premium: boolean;
}

export interface IUser extends mongoose.Document {
    email?: string;
    telegram?: TelegramUser;
    referralCode?: string;

    updatedAt?: Date;
    createdAt: Date;
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
    referralCode: { type: String },

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
    };
};

export const User = mongoose.model<IUser>('users', UserSchema);