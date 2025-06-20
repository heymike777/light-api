import * as mongoose from 'mongoose';
import { Chain } from '../../services/solana/types';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface ITradingEventSpecialPrizeSubmission extends mongoose.Document {
    eventId: string;
    userId: string;
    info: string;

    updatedAt?: Date;
    createdAt: Date;
}

export const TradingEventSpecialPrizeSubmissionSchema = new mongoose.Schema<ITradingEventSpecialPrizeSubmission>({
    eventId: { type: String, required: true },
    userId: { type: String, required: true },
    info: { type: String, required: true },

    updatedAt: { type: Date, default: new Date() },
    createdAt: { type: Date, default: new Date() }
});

TradingEventSpecialPrizeSubmissionSchema.index({ eventId: 1 });

TradingEventSpecialPrizeSubmissionSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    return next();
});

export const TradingEventSpecialPrizeSubmission = mongoose.model<ITradingEventSpecialPrizeSubmission>('trading-events-sperial-prize-submissions', TradingEventSpecialPrizeSubmissionSchema);