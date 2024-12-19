import * as mongoose from 'mongoose';
import { ParsedTx } from '../managers/ProgramManager';
import { ChangedWallet } from '../models/types';
import { IToken } from './tokens/Token';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface IUserTransaction extends mongoose.Document {
    userId: string;
    signature?: string;

    parsedTx: ParsedTx;
    tokens?: IToken[];
    changedWallets?: ChangedWallet[];

    updatedAt?: Date;
    createdAt: Date;
}

export const UserTransactionSchema = new mongoose.Schema<IUserTransaction>({
    userId: { type: String },
    signature: { type: String },

    parsedTx: { type: Mixed },
    tokens: { type: Mixed },
    changedWallets: { type: Mixed },

    updatedAt: { type: Date, default: new Date() },
    createdAt: { type: Date, default: new Date() }
});

UserTransactionSchema.index({ 'userId': 1 });
UserTransactionSchema.index({ 'userId': 1, _id: 1, createdAt: -1 });
UserTransactionSchema.index({ 'userId': 1, signature: 1 }, { unique: true });

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