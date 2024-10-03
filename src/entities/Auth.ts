import * as mongoose from 'mongoose';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface IAuth extends mongoose.Document {
    email: string;
    code: string;
    tries: number;
    lastSentAt: Date;
    success?: boolean;

    updatedAt?: Date;
    createdAt?: Date;
}

export const AuthSchema = new mongoose.Schema<IAuth>({
    email: { type: String, required: true },
    code: { type: String, required: true },
    tries: { type: Number, required: true, default: 0 },
    lastSentAt: { type: Date, required: false },
    success: { type: Boolean, required: false },

    updatedAt: { type: Date, required: false },
    createdAt: { type: Date, required: false },
});

AuthSchema.pre('save', function (next) {
    this.updatedAt = new Date();

    return next();
});

AuthSchema.index({ email: 1, createdAt: 1 });

AuthSchema.methods.toJSON = function () {
    return {
        id: this._id,
    };
};

export const Auth = mongoose.model<IAuth>('auth', AuthSchema);