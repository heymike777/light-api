import * as mongoose from 'mongoose';
import { ParsedTx } from '../../managers/ProgramManager';
import { ChangedWallet } from '../../models/types';
import { IToken, ITokenModel } from '../tokens/Token';
import { Chain } from '../../services/solana/types';
import { LogManager } from '../../managers/LogManager';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface IUserTransaction extends mongoose.Document {
    geyserId: string;
    userId: string;
    signature: string;
    chain: Chain;

    title?: string;
    description?: string;

    parsedTx?: ParsedTx;
    tokens?: ITokenModel[];
    changedWallets?: ChangedWallet[];

    updatedAt?: Date;
    createdAt: Date;

    
}

export const UserTransactionSchema = new mongoose.Schema<IUserTransaction>({
    geyserId: { type: String },
    userId: { type: String },
    signature: { type: String },
    chain: { type: String },

    title: { type: String },
    description: { type: String },

    parsedTx: { type: Mixed },
    tokens: { type: Mixed },
    changedWallets: { type: Mixed },

    updatedAt: { type: Date, default: new Date() },
    createdAt: { type: Date, default: new Date() }
});

// UserTransactionSchema.index({ 'userId': 1 });
UserTransactionSchema.index({ 'userId': 1, createdAt: -1 });
UserTransactionSchema.index({ 'userId': 1, _id: 1, createdAt: -1 });
UserTransactionSchema.index({ 'userId': 1, signature: 1 }, { unique: true });

UserTransactionSchema.pre('save', function (next) {
    this.updatedAt = new Date();

    return next();
});

UserTransactionSchema.methods.toJSON = function () {
    return {
        id: this._id,
        chain: this.chain,
        geyserId: this.geyserId,
        userId: this.userId,
        signature: this.signature,
        title: this.title,
        description: this.description,
        parsedTx: this.parsedTx,
        tokens: this.tokens.filter((t: IToken) => t.symbol),
        changedWallets: this.changedWallets,
        createdAt: this.createdAt,
    };
};

export function userTransactionFromJson(json: string): IUserTransaction | undefined {
    try{
        const obj = JSON.parse(json);
        const tx = new UserTransaction();
        tx._id = obj.id;
        tx.chain = obj.chain;
        tx.geyserId = obj.geyserId;
        tx.userId = obj.userId;
        tx.signature = obj.signature;
        tx.title = obj.title;
        tx.description = obj.description;
        tx.parsedTx = obj.parsedTx;
        tx.tokens = obj.tokens;
        tx.changedWallets = obj.changedWallets;
        tx.createdAt = obj.createdAt;
        return tx;
    }
    catch(e){
        LogManager.error('userTransactionFromJson', e);
    }
    return undefined
};

export const UserTransaction = mongoose.model<IUserTransaction>('users-transactions', UserTransactionSchema);