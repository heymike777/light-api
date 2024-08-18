import * as mongoose from 'mongoose';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface IUser extends mongoose.Document {
    chatId: number;
    firstName: string;
    lastName: string;
    username: string;
    isPremium: boolean;
    isBot: boolean;
    languageCode: string;

    //isChannel
    //isGroup

    updatedAt?: Date;
    createdAt: Date;
}

export const UserSchema = new mongoose.Schema<IUser>({
    chatId: { type: Number },
    firstName: { type: String },
    lastName: { type: String },
    username: { type: String },
    isPremium: { type: Boolean },
    isBot: { type: Boolean },
    languageCode: { type: String },

    updatedAt: { type: Date, default: new Date() },
    createdAt: { type: Date, default: new Date() }
});

UserSchema.index({ chatId: 1 });

UserSchema.pre('save', function (next) {
    this.updatedAt = new Date();

    return next();
});

UserSchema.methods.toJSON = function () {
    return {
        id: this._id,
    };
};

export const User = mongoose.model<IUser>('users', UserSchema);