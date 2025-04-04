import * as mongoose from 'mongoose';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface IUserRefCode extends mongoose.Document {
    userId: string;
    code: string;
    deactivatedAt?: Date;
    active: boolean;
    createdAt: Date;
}

export const UserRefCodeSchema = new mongoose.Schema<IUserRefCode>({
    userId: { type: String },
    code: { type: String },
    deactivatedAt: { type: Date },
    active: { type: Boolean, default: true },
    createdAt: { type: Date, default: new Date() }
});

UserRefCodeSchema.index({ userId: 1, active: 1 });
UserRefCodeSchema.index({ code: 1, active: 1 });

UserRefCodeSchema.methods.toJSON = function () {
    return {
        userId: this.userId,
        code: this.code,
        createdAt: this.createdAt
    };
};

export const UserRefCode = mongoose.model<IUserRefCode>('users-ref-codes', UserRefCodeSchema);