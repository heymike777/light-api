import * as mongoose from 'mongoose';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

export interface RefStats {
    usersCount: {
        direct: number;
        indirect: number;
    };
    rewardsTotal: {
        sol: number;
        usdc: number;
    }
    rewardsPaid: {
        sol: number;
        usdc: number;
    }
}

export interface IUserRefStats extends mongoose.Document {
    userId: string;
    stats: RefStats;
    createdAt: Date;
}

export const UserRefStatsSchema = new mongoose.Schema<IUserRefStats>({
    userId: { type: String },
    stats: { type: Mixed },
    createdAt: { type: Date, default: new Date() }
});

UserRefStatsSchema.index({ userId: 1 }, { unique: true });

UserRefStatsSchema.methods.toJSON = function () {
    return {
        userId: this.userId,
        stats: this.stats,
    };
};

export const UserRefStats = mongoose.model<IUserRefStats>('users-ref-stats', UserRefStatsSchema);