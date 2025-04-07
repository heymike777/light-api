import * as mongoose from 'mongoose';
import { TgMessage } from '../managers/bot/BotTypes';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface IConfig extends mongoose.Document {
    isRefPayoutsEnabled: boolean;
    updatedAt?: Date;
    createdAt: Date;
}

export const ConfigSchema = new mongoose.Schema<IConfig>({
    isRefPayoutsEnabled: { type: Boolean, default: true },
    updatedAt: { type: Date, default: new Date() },
    createdAt: { type: Date, default: new Date() }
});

// ConfigSchema.index({ chatId: 1 });

ConfigSchema.pre('save', function (next) {
    this.updatedAt = new Date();

    return next();
});

export const Config = mongoose.model<IConfig>('config', ConfigSchema);