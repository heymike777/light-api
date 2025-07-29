import * as mongoose from 'mongoose';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface IChaosStakeTx extends mongoose.Document {
    walletAddress: string;
    amount: number;
    mint: string;
    signature: string;
    createdAt: Date;
}

export const ChaosStakeTxSchema = new mongoose.Schema<IChaosStakeTx>({
    walletAddress: { type: String },
    amount: { type: Number },
    mint: { type: String },
    signature: { type: String },
    createdAt: { type: Date, default: new Date() }
});

ChaosStakeTxSchema.index({ walletAddress: 1 });

ChaosStakeTxSchema.methods.toJSON = function () {
    return {
        walletAddress: this.walletAddress,
    };
};

export const ChaosStakeTx = mongoose.model<IChaosStakeTx>('staking-chaos-txs', ChaosStakeTxSchema);