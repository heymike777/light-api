import { IUser, User } from "../entities/users/User";
import { UserRefClaim } from "../entities/referrals/UserRefClaim";
import { UserRefCode } from "../entities/referrals/UserRefCode";
import { Helpers } from "../services/helpers/Helpers";
import { LogManager } from "./LogManager";
import { UserManager } from "./UserManager";
import { RefStats, UserRefStats } from "../entities/referrals/UserRefStats";

export class ReferralsManager {

    static async claimRefCode(user: IUser, referralCode: string, throwError: boolean = true) {
        const now = new Date();

        // if (user.parent && user.parent.createdAt && user.parent.createdAt.getTime() > now.getTime() - 7 * 24 * 60 * 60 * 1000){
        //     LogManager.log('BotStartHelper', 'start', 'user already have parent');
        //     if (throwError){
        //         throw new Error('You can update your referral code only once a week');
        //     }
        // }
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
}