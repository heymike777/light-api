import * as mongoose from 'mongoose';
import { Chain } from '../../services/solana/types';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface ITradingEventPoints extends mongoose.Document {
    eventId: string;
    userId: string;
    traderProfileId: string;
    points: number;

    updatedAt?: Date;
    createdAt: Date;
}

export const TradingEventPointsSchema = new mongoose.Schema<ITradingEventPoints>({
    eventId: { type: String, required: true },
    userId: { type: String, required: true },
    traderProfileId: { type: String, required: true },
    points: { type: Number, required: true },

    updatedAt: { type: Date, default: new Date() },
    createdAt: { type: Date, default: new Date() }
});

TradingEventPointsSchema.index({ eventId: 1, userId: 1 });
TradingEventPointsSchema.index({ eventId: 1, points: -1 });
TradingEventPointsSchema.index({ eventId: 1, traderProfileId: 1 }, { unique: true });

TradingEventPointsSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    return next();
});

export const TradingEventPoints = mongoose.model<ITradingEventPoints>('trading-events-points', TradingEventPointsSchema);