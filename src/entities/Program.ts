import * as mongoose from 'mongoose';
import { TgMessage } from '../managers/bot/BotManager';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface IProgram extends mongoose.Document {
    programId: string;
    updatedAt: Date;
    createdAt: Date;
}

export const ProgramSchema = new mongoose.Schema<IProgram>({
    programId: { type: String },
    updatedAt: { type: Date, default: new Date() },
    createdAt: { type: Date, default: new Date() }
});

ProgramSchema.index({ programId: 1 }, { unique: true });

ProgramSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    return next();
});

ProgramSchema.methods.toJSON = function () {
    return {
        programId: this.programId,
    };
};

export const Program = mongoose.model<IProgram>('programs', ProgramSchema);