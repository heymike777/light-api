import * as mongoose from 'mongoose';
import { Chain } from '../../services/solana/types';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export enum TradingEventStatus {
    UPCOMING = 'upcoming',
    ACTIVE = 'active',
    COMPLETED = 'completed',
    CANCELLED = 'cancelled'
}

export interface ITradingEvent extends mongoose.Document {
    title: string;
    description: string;
    startAt: Date;
    endAt: Date;
    status: TradingEventStatus;
    image?: string; // optional image URL for the event
    chain?: Chain;    
    tradingPoints?: { [key: string]: number; }; // for example, { '<bonk mint>': 1250, '*': 1000 }. For all tokens, use '*'. 1250 points for every dollar traded on BONK, 1000 points for every dollar traded on any other token
    tokens?: {mint: string, symbol: string}[]; // tokens that are traded in the event

    updatedAt?: Date;
    createdAt: Date;
}

export const TradingEventSchema = new mongoose.Schema<ITradingEvent>({
    title: { type: String, required: true },
    description: { type: String, required: true },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    status: { type: String },
    image: { type: String },
    chain: { type: String }, // optional, can be used to filter events by chain

    tradingPoints: { type: Mixed },
    tokens: { type: Array },

    updatedAt: { type: Date, default: new Date() },
    createdAt: { type: Date, default: new Date() }
});

TradingEventSchema.index({ status: 1 });
TradingEventSchema.index({ status: 1, startAt: 1, endAt: 1 });
TradingEventSchema.index({ status: 1, startAt: 1 });
TradingEventSchema.index({ status: 1, endAt: 1 });
TradingEventSchema.index({ status: 1, startAt: -1 });

TradingEventSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    return next();
});

export const TradingEvent = mongoose.model<ITradingEvent>('trading-events', TradingEventSchema);