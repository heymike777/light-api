import * as mongoose from 'mongoose';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface IUserUtm extends mongoose.Document {
    userId: string;
    utm: string;
    createdAt: Date;
}

export const UserUtmSchema = new mongoose.Schema<IUserUtm>({
    userId: { type: String },
    utm: { type: String },
    createdAt: { type: Date, default: new Date() }
});

export const UserUtm = mongoose.model<IUserUtm>('users-utms', UserUtmSchema);