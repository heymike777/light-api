import { IUser, User } from "../entities/users/User";
import { UserRefClaim } from "../entities/referrals/UserRefClaim";
import { UserRefCode } from "../entities/referrals/UserRefCode";
import { Helpers } from "../services/helpers/Helpers";
import { LogManager } from "./LogManager";
import { RefStats, UserRefStats } from "../entities/referrals/UserRefStats";
import { ConfigManager } from "./ConfigManager";
import { SystemNotificationsManager } from "./SytemNotificationsManager";
import { UserRefReward } from "../entities/referrals/UserRefReward";
import { Currency } from "../models/types";

export class ReferralsManager {

    static async claimRefCode(user: IUser, referralCode: string, throwError: boolean = true) {
        const now = new Date();
        LogManager.log('claimRefCode', 'user:', user.id, 'referralCode:', referralCode);

        // if (user.parent && user.parent.createdAt && user.parent.createdAt.getTime() > now.getTime() - 7 * 24 * 60 * 60 * 1000){
        //     LogManager.log('BotStartHelper', 'start', 'user already have parent');
        //     if (throwError){
        //         throw new Error('You can update your referral code only once a week');
        //     }
        // }

        LogManager.log('claimRefCode', 'user:', user.id, 'user.parent:', user.parent);
        if (user.parent){
            LogManager.log('BotStartHelper', 'start', 'user already have parent');
            if (throwError){
                throw new Error('You have already used referral code');
            }
        }
        else {
            const parentUserId = await this.findUserByReferralCode(referralCode);
            if (!parentUserId){
                LogManager.log('BotStartHelper', 'start', 'referral code not found');
                if (throwError){
                    throw new Error('Referral code not found');
                }
                return;
            }
            if (parentUserId == user.id){
                LogManager.log('BotStartHelper', 'start', 'user cannot use his own referral code');
                if (throwError){
                    throw new Error('You cannot use your own referral code');
                }
                return;
            }

            user.parent = {
                userId: parentUserId,
                referralCode: referralCode,
                createdAt: now
            };

            await User.updateOne({ _id: user._id }, {
                $set: {
                    parent: user.parent,
                }
            });

            await UserRefClaim.create({
                userId: user.id,
                referralCode: referralCode,
                parentUserId: parentUserId,
                claimedAt: new Date()
            });
        }
    }

    static async findUserByReferralCode(referralCode: string): Promise<string | undefined> {
        const refCode = await UserRefCode.findOne({ code: referralCode, active: true });
        return refCode?.userId;
    }

    static async createReferralCode(user: IUser, shouldSaveToUser = true): Promise<string> {
        let code = user.telegram?.username || Helpers.makeid(8);
        let triesLeft = 50;
        while (true){
            const existing = await UserRefCode.findOne({ code: code, active: true });
            if (!existing){
                break;
            }

            code = Helpers.makeid(8);
            triesLeft--;
            if (triesLeft <= 0){
                throw new Error('Could not generate referral code');
            }
        }

        const refCode = new UserRefCode({
            userId: user.id,
            code: code,
            active: true
        });
        await refCode.save();

        if (shouldSaveToUser || !user.referralCode){
            user.referralCode = code;
            await User.updateOne({ _id: user._id }, {
                $set: {
                    referralCode: code,
                }
            });
        }

        return code;
    }

    static async saveReferralCode(user: IUser, code: string) {
        const existing = await UserRefCode.findOne({ code: code, active: true });
        if (existing){
            throw new Error('Referral code already exists');
        }

        const refCode = new UserRefCode({
            userId: user.id,
            code: code,
            active: true
        });
        await refCode.save();

        if (!user.referralCode){
            user.referralCode = code;
            await User.updateOne({ _id: user._id }, {
                $set: {
                    referralCode: code,
                }
            });
        }

        return code;
    }

    static async isValidReferralCode(code: string): Promise<boolean> {
        if (code.length < 3){
            return false;
        }
        if (code.length > 20){
            return false;
        }

        if (code.includes(' ')){
            return false;
        }
        // refcodes should contains only letters, numbers, '-', '_'
        if (!/^[a-zA-Z0-9-_]+$/.test(code)){
            return false;
        }
        
        // check if code already exists
        const existing = await UserRefCode.findOne({ code: code, active: true });
        if (existing){
            return false;
        }

        return true;
    }

    static async fetchUserRefStats(userId: string): Promise<RefStats | undefined> {
        const userRefStats = await UserRefStats.findOne({ userId: userId });
        return userRefStats?.stats;
    }

    static async recalcRefStats(){
        // get unique userId from UserRefReward during last two hours
        const usersIds = await UserRefReward.distinct('userId', { createdAt: { $gte: new Date(Date.now() - 1000 * 60 * 60 * 2) } });
        if (usersIds.length == 0){
            LogManager.log('ReferralsManager', 'recalcRefStats', 'No users to recalc');
            return;
        }
        
        console.log('Recalculating ref stats for', usersIds.length, 'users:', usersIds);
        for (const userId of usersIds){
            await this.recalcUserRefStats(userId);
        }
    }

    static async recalcUserRefStats(userId: string){
        let userRefStats = await UserRefStats.findOne({ userId: userId });
        if (!userRefStats){
            userRefStats = new UserRefStats();
            userRefStats.userId = userId;
            userRefStats.createdAt = new Date();
            userRefStats.stats = {
                usersCount: {
                    direct: 0,
                    indirect: 0
                },
                rewardsTotal: {
                    sol: 0,
                    usdc: 0
                },
                rewardsPaid: {
                    sol: 0,
                    usdc: 0
                },
            };
            await userRefStats.save();
        } 

        const refStats = userRefStats.stats;

        // calculate ref stats - usersCount
        let refUsers = await User.find({ 'parent.userId': userId });
        refStats.usersCount.direct = refUsers.length;
        refStats.usersCount.indirect = 0;

        // 4 levels of referrals
        for (let index = 0; index < 4; index++) {
            if (refUsers.length > 0){
                const refUsersIds = refUsers.map((user) => user.id);            
                const newRefUsers = await User.find({ 'parent.userId': { $in: refUsersIds } });
                refStats.usersCount.indirect += newRefUsers.length;
                refUsers = newRefUsers; 
            }     
        }

        // calculate ref stats - rewardsTotal and rewardsPaid
        const rewards = await UserRefReward.aggregate([
            { $match: { userId: userId } },
            { 
                $group: { 
                    _id: null, 
                    usd: { $sum: '$usdAmount' }, 
                    sol: { $sum: { $cond: [{ $eq: ['$currency', Currency.SOL] }, '$amount', 0] } }, 
                    usdc: { $sum: { $cond: [{ $eq: ['$currency', Currency.USDC] }, '$amount', 0] } } 
                }
            },
        ]);

        console.log('refStats:', refStats);
        console.log('rewards:', rewards);

        // rewards[0] is the total rewards
        if (rewards.length > 0){
            const reward = rewards[0];
            refStats.rewardsTotal.sol = reward.sol;
            refStats.rewardsTotal.usdc = reward.usdc;
        }

        // refStats.rewardsPaid.sol = reward.sol; // TODO: calculate paid rewards
        // refStats.rewardsPaid.usdc = reward.usdc; // TODO: calculate paid rewards


        await UserRefStats.updateOne({ userId: userId }, { $set: { stats: refStats } });
    }

    static async processRefPayouts(){
        const config = await ConfigManager.getConfig();
        if (!config.isRefPayoutsEnabled){
            LogManager.error('Ref payouts are disabled');
            SystemNotificationsManager.sendSystemMessage('Ref payouts are disabled');
            return;
        }

        //TODO: process ref payouts if user has more than 0.005 SOL of unpaid referral earnings
    }

}