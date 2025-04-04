import { IUser, User } from "../entities/users/User";
import { UserRefClaim } from "../entities/users/UserRefClaim";
import { UserRefCode } from "../entities/users/UserRefCode";
import { LogManager } from "./LogManager";

export class ReferralsManager {

    static async claimRefCode(user: IUser, referralCode: string, throwError: boolean = true) {
        const now = new Date();

        if (user.parent && user.parent.createdAt && user.parent.createdAt.getTime() > now.getTime() - 7 * 24 * 60 * 60 * 1000){
            LogManager.log('BotStartHelper', 'start', 'user already have parent');
            if (throwError){
                throw new Error('You can update your referral code only once a week');
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


}