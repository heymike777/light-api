import * as mongoose from 'mongoose';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface IAuth extends mongoose.Document {
    verificationService: string;
    email: string;
    code: string;
    tries: number;
    lastSentAt: Date;
    success?: boolean;

    updatedAt?: Date;
    createdAt?: Date;
}

export const AuthSchema = new mongoose.Schema<IAuth>({
    verificationService: { type: String },
    email: { type: String },
    code: { type: String },
    tries: { type: Number },
    lastSentAt: { type: Date },
    success: { type: Boolean },

    updatedAt: { type: Date },
    createdAt: { type: Date },
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