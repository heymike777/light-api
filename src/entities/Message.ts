import * as mongoose from 'mongoose';
import { TgMessage } from '../managers/bot/BotManager';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface IMessage extends mongoose.Document {
    chatId: number;
    firstName?: string;
    lastName?: string;
    username?: string;
    isPremium?: boolean;
    isBot?: boolean;
    languageCode?: string;

    //isChannel
    //isGroup

    data: TgMessage;

    updatedAt?: Date;
    createdAt: Date;
}

export const MessageSchema = new mongoose.Schema<IMessage>({
    chatId: { type: Number },
    firstName: { type: String },
    lastName: { type: String },
    username: { type: String },
    isPremium: { type: Boolean },
    isBot: { type: Boolean },
    languageCode: { type: String },

    data: { type: Mixed },

    updatedAt: { type: Date, default: new Date() },
    createdAt: { type: Date, default: new Date() }
});

MessageSchema.index({ chatId: 1 });
MessageSchema.index({ chatId: 1, createdAt: -1 });

MessageSchema.pre('save', function (next) {
    this.updatedAt = new Date();

    return next();
});

MessageSchema.methods.toJSON = function () {
    return {
        id: this._id,
    };
};

export const Message = mongoose.model<IMessage>('messages', MessageSchema);