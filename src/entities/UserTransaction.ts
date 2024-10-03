import * as mongoose from 'mongoose';
import { ParsedTx } from '../managers/ProgramManager';
import { TokenNft } from '../managers/TokenManager';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface IUserTransaction extends mongoose.Document {
    userId: string;
    chatId?: number;

    parsedTx: ParsedTx;
    asset?: TokenNft;


    updatedAt?: Date;
    createdAt: Date;
}

export const UserTransactionSchema = new mongoose.Schema<IUserTransaction>({
    userId: { type: String },
    chatId: { type: Number },

    parsedTx: { type: Mixed },
    asset: { type: Mixed },

    updatedAt: { type: Date, default: new Date() },
    createdAt: { type: Date, default: new Date() }
});

UserTransactionSchema.index({ 'userId': 1 });

UserTransactionSchema.pre('save', function (next) {
    this.updatedAt = new Date();

    return next();
});

UserTransactionSchema.methods.toJSON = function () {
    return {
        id: this._id,
        userId: this.userId,
    };
};

export const UserTransaction = mongoose.model<IUserTransaction>('users-transactions', UserTransactionSchema);