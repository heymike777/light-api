import * as mongoose from 'mongoose';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface IUserRefClaim extends mongoose.Document {
    userId: string;
    referralCode: string;
    createdAt: Date;
}

export const UserRefClaimSchema = new mongoose.Schema<IUserRefClaim>({
    userId: { type: String },
    referralCode: { type: String },
    createdAt: { type: Date, default: new Date() }
});

UserRefClaimSchema.index({ userId: 1 });
UserRefClaimSchema.index({ referralCode: 1 });

UserRefClaimSchema.methods.toJSON = function () {
    return {
        userId: this.userId,
        referralCode: this.referralCode,
        createdAt: this.createdAt
    };
};

export const UserRefClaim = mongoose.model<IUserRefClaim>('users-ref-claims', UserRefClaimSchema);