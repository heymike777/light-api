import * as mongoose from 'mongoose';
import { Status } from '../../services/solana/types';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface IChaosStakeTx extends mongoose.Document {
    userId: string;
    walletAddress: string;
    amount: number;
    mint: string;
    signature: string;
    status: Status;
    createdAt: Date;
}

export const ChaosStakeTxSchema = new mongoose.Schema<IChaosStakeTx>({
    userId: { type: String },
    walletAddress: { type: String },
    amount: { type: Number },
    mint: { type: String },
    signature: { type: String },
    status: { type: String, enum: Status, default: Status.CREATED },
    createdAt: { type: Date, default: new Date() }
});

ChaosStakeTxSchema.index({ walletAddress: 1 });
ChaosStakeTxSchema.index({ walletAddress: 1, status: 1 });
ChaosStakeTxSchema.index({ chain: 1, signature: 1 });
ChaosStakeTxSchema.index({ _id: 1, status: 1 });
ChaosStakeTxSchema.index({ createdAt: 1, status: 1 });

ChaosStakeTxSchema.methods.toJSON = function () {
    return {
        walletAddress: this.walletAddress,
    };
};

export const ChaosStakeTx = mongoose.model<IChaosStakeTx>('staking-chaos-txs', ChaosStakeTxSchema);