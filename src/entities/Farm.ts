import * as mongoose from 'mongoose';
import { Chain, DexId } from '../services/solana/types';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export enum FarmType {
    DEX = 'dex',
    TOKEN = 'token',
}

export enum FarmStatus {
    CREATED = 'created',
    ACTIVE = 'active',
    PAUSED = 'paused',
    COMPLETED = 'completed',
}

export interface IFarmPool {
    address: string;
    tokenA: string;
    tokenB: string;
    title?: string;
    solBased?: boolean;
}

export interface IFarm extends mongoose.Document {
    title: string;
    chain: Chain;
    userId: string;
    traderProfileId: string;
    status: FarmStatus;
    type: FarmType;
    dexId?: DexId;
    frequency: number; // in seconds
    volume: number; // in USD
    fee: number; // in %
    mint?: string;
    pools: IFarmPool[];
    lastSwapAt?: Date;
    progress?: {
        currentVolume: number;
        processingVolume: number;
        buysInARow: number;
        maxBuysInARow: number;
    }
    failedSwapsCount: number;

    updatedAt?: Date;
    createdAt: Date;
}

export const FarmSchema = new mongoose.Schema<IFarm>({
    title: { type: String },
    chain: { type: String, enum: Object.values(Chain), default: Chain.SOLANA },
    userId: { type: String },
    traderProfileId: { type: String },
    status: { type: String, enum: Object.values(FarmStatus), default: FarmStatus.CREATED },
    type: { type: String, enum: Object.values(FarmType), default: FarmType.DEX },
    dexId: { type: String, enum: Object.values(DexId) },
    frequency: { type: Number },
    volume: { type: Number },
    fee: { type: Number, default: 0 },
    mint: { type: String },
    pools: { type: Mixed },
    lastSwapAt: { type: Date },
    progress: { type: Mixed },
    failedSwapsCount: { type: Number, default: 0 },

    updatedAt: { type: Date, default: new Date() },
    createdAt: { type: Date, default: new Date() }
});

FarmSchema.index({ userId: 1 });
FarmSchema.index({ userId: 1, status: 1 });
FarmSchema.index({ status: 1 });
FarmSchema.index({ userId: 1, traderProfileId: 1, status: 1 });
FarmSchema.index({ _id: 1, status: 1 });

FarmSchema.pre('save', function (next) {
    this.updatedAt = new Date();

    return next();
});

FarmSchema.methods.toJSON = function () {
    return {
        id: this.id,
        title: this.title,
        userId: this.userId,
        traderProfileId: this.traderProfileId,
        status: this.status,
        type: this.type,
        dexId: this.dexId,
        frequency: this.frequency,
        volume: this.volume,
        fee: this.fee,
    };
};

export const Farm = mongoose.model<IFarm>('farms', FarmSchema);