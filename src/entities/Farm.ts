import * as mongoose from 'mongoose';
import { DexId } from '../services/solana/types';

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

export interface IFarm extends mongoose.Document {
    userId: string;
    traderProfileId?: string;
    status: FarmStatus;
    type: FarmType;
    dexId?: DexId;
    frequency?: number; // in seconds
    volume?: number; // in USD

    updatedAt?: Date;
    createdAt: Date;
}

export const FarmSchema = new mongoose.Schema<IFarm>({
    userId: { type: String },
    traderProfileId: { type: String },
    status: { type: String, enum: Object.values(FarmStatus), default: FarmStatus.CREATED },
    type: { type: String, enum: Object.values(FarmType), default: FarmType.DEX },
    dexId: { type: String, enum: Object.values(DexId) },
    frequency: { type: Number },
    volume: { type: Number },

    updatedAt: { type: Date, default: new Date() },
    createdAt: { type: Date, default: new Date() }
});

FarmSchema.index({ userId: 1 });
FarmSchema.index({ userId: 1, status: 1 });

FarmSchema.pre('save', function (next) {
    this.updatedAt = new Date();

    return next();
});

FarmSchema.methods.toJSON = function () {
    return {
        id: this.id,
        userId: this.userId,
        traderProfileId: this.traderProfileId,
        status: this.status,
        type: this.type,
        dexId: this.dexId,
        frequency: this.frequency,
        volume: this.volume,
    };
};

export const Farm = mongoose.model<IFarm>('farms', FarmSchema);