import * as mongoose from 'mongoose';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface IPushToken extends mongoose.Document {
    userId: string;
    deviceId: string;
    token: string;
    createdAt: Date;
}

export const PushTokenSchema = new mongoose.Schema<IPushToken>({
    userId: { type: String },
    deviceId: { type: String },
    token: { type: String },
    createdAt: { type: Date, default: new Date() },
});

PushTokenSchema.index({ userId: 1 });
PushTokenSchema.index({ token: 1 });
PushTokenSchema.index({ deviceId: 1 });
PushTokenSchema.index({ userId: 1, token: 1 }, { unique: true });

export const PushToken = mongoose.model<IPushToken>('users-push-tokens', PushTokenSchema);