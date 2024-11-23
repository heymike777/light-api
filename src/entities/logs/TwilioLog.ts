import * as mongoose from 'mongoose';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface ITwilioLog extends mongoose.Document {
    request: string;
    email: string;
    response: string;
    createdAt: Date;
}

export const TwilioLogSchema = new mongoose.Schema<ITwilioLog>({
    request: { type: String },
    email: { type: String },
    response: { type: String },
    createdAt: { type: Date },
});

export const TwilioLog = mongoose.model<ITwilioLog>('logs-twilio', TwilioLogSchema);