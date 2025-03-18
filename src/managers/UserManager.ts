import { Subscription, SubscriptionStatus, SubscriptionTier } from "../entities/payments/Subscription";
import { PushToken } from "../entities/PushToken";
import { UserTraderProfile } from "../entities/users/TraderProfile";
import { IUser, TelegramState, TelegramUser, User } from "../entities/users/User";
import { UserTransaction } from "../entities/users/UserTransaction";
import { Wallet } from "../entities/Wallet";
import { BadRequestError } from "../errors/BadRequestError";
import { Priority } from "../services/solana/types";
import { LogManager } from "./LogManager";
import { MixpanelManager } from "./MixpanelManager";
import { SubscriptionManager } from "./SubscriptionManager";
import { SwapManager } from "./SwapManager";
import { SystemNotificationsManager } from "./SytemNotificationsManager";
import { TraderProfilesManager } from "./TraderProfilesManager";

export class UserManager {

    static cacheEnabled = false;
    static cachedUsers: {user: IUser, createdAt: Date}[] = [];

    static async getUserById(id: string, forceCleanCache = false): Promise<IUser> {
        if (!forceCleanCache && this.cacheEnabled){
            const cachedUser = this.cachedUsers.find(cachedUser => cachedUser.user.id == id);
            if (cachedUser){
                return cachedUser.user;
            }
        }

        const now = new Date();
        const user = await User.findById(id);
        if (user){
            await UserManager.fillUserWithData(user);

            if (this.cacheEnabled){
                // remove user with the same id
                await this.removeUserFromCache(id);
                this.cachedUsers.push({ user: user, createdAt: now });
            }

            return user;
        }
        else {
            throw new Error('User not found');
        }
    }

    static async removeUserFromCache(id: string){
        this.cachedUsers = this.cachedUsers.filter(cachedUser => cachedUser.user.id != id);
    }

    static async getUserByTelegramUser(from: TelegramUser, forceCleanCache = false): Promise<IUser> {
        if (!forceCleanCache && this.cacheEnabled){
            const cachedUser = this.cachedUsers.find(cachedUser => cachedUser.user.telegram?.id === from.id);
            if (cachedUser){
                return cachedUser.user;
            }
        }

        const now = new Date();
        const user = await User.findOne({ 'telegram.id': from.id });
        if (user){
            await UserManager.fillUserWithData(user);
            if (user.telegram?.is_bot !== from.is_bot || user.telegram?.first_name !== from.first_name || user.telegram?.last_name !== from.last_name || user.telegram?.username !== from.username || user.telegram?.language_code !== from.language_code){
                user.telegram = from;

                await User.updateOne({ _id: user._id }, {
                    $set: {
                        telegram: from,
                    }
                });
            }

            if (this.cacheEnabled){
                // remove user with the same id
                await this.removeUserFromCache(user.id);
                this.cachedUsers.push({ user: user, createdAt: now });
            }
            return user;
        }
        else {
            const newUser = await User.create({
                telegram: from,
                createdAt: now,
            });

            await TraderProfilesManager.createTraderProfile(newUser, SwapManager.kNativeEngineId, 'Trader', Priority.MEDIUM);

            MixpanelManager.updateProfile(newUser, undefined);

            let fullName = from.first_name || '' + (from.last_name ? ' ' + from.last_name : '');
            fullName = fullName.trim();
            SystemNotificationsManager.sendSystemMessage(`New user: @${from.username} (${fullName})`);

            if (this.cacheEnabled){
                this.cachedUsers.push({ user: newUser, createdAt: now });
            }
            return newUser;
        }
    }

    static async cleanOldUserTransactions(userId: string) {
        const count = await UserTransaction.countDocuments({ userId: userId });
        LogManager.log('user', userId, 'UserTransaction.count', count);

        const kLimit = 100;
        if (count > kLimit){
            const tx = await UserTransaction.findOne({ userId: userId }).sort({ createdAt: -1 }).skip(kLimit);

            if (!tx){
                return;
            }
            
            let index = 0;
            while (index < 10){
                const deletedTxs = await UserTransaction.find({ userId: userId, createdAt: { $lt: tx.createdAt } }).limit(1000);
                if (deletedTxs.length == 0){
                    break;
                }
                const tmp = await UserTransaction.deleteMany({ _id: { $in: deletedTxs.map((tx) => tx.id) } });
                LogManager.log('user', userId, 'deleted', tmp.deletedCount, 'transactions');
                index++;
            }
        }
    }

    static async cleanOldCache(){
        if (this.cacheEnabled){
            const now = new Date();
            this.cachedUsers = this.cachedUsers.filter(cachedUser => now.getTime() - cachedUser.createdAt.getTime() < 1000 * 60 * 5);    
        }
    }

    static async fillUserWithData(user: IUser): Promise<IUser> {
        await UserManager.fillUserWithSubscription(user);
        await UserManager.fillUserWithTraderProfiles(user);
        return user;
    }

    static async fillUserWithSubscription(user: IUser): Promise<IUser> {
        const subscriptions = await Subscription.find({ userId: user.id, status: SubscriptionStatus.ACTIVE });

        // LogManager.log('fillUserWithSubscription', user.id, subscriptions);

        subscriptions.sort((a, b) => {
            const aImportance = SubscriptionManager.getTierImportance(a.tier);
            const bImportance = SubscriptionManager.getTierImportance(b.tier);
            if (aImportance < bImportance){ return 1; }
            else if (aImportance > bImportance){ return -1; }
            return 0;
        });

        // LogManager.log('fillUserWithSubscription (sorted)', user.id, subscriptions);

        if (subscriptions.length > 0){
            user.subscription = subscriptions[0];
        }

        user.maxNumberOfWallets = SubscriptionManager.getMaxNumberOfWallets(user.subscription?.tier);
        user.maxNumberOfTraderProfiles = SubscriptionManager.getMaxNumberOfTraderProfiles(user.subscription?.tier);

        return user;
    }

    static async fillUserWithTraderProfiles(user: IUser): Promise<IUser> {
        user.traderProfiles = await TraderProfilesManager.getUserTraderProfiles(user.id);
        return user;
    }

    static async updateTelegramState(userId: string, state?: TelegramState){
        if (!state){
            await User.updateOne({ _id: userId }, {
                $unset: {
                    telegramState: 1,
                }
            });
        }
        else {
            await User.updateOne({ _id: userId }, {
                $set: {
                    telegramState: state,
                }
            });
        }

        LogManager.log('updateTelegramState', userId, state);
    }

    static async mergeUsers(fromUserId: string, toUserId: string){
        const fromUser = await User.findById(fromUserId);
        const toUser = await User.findById(toUserId);
        LogManager.log('mergeUsers', 'fromUserId:', fromUserId, 'toUserId:', toUserId, 'fromUser:', fromUser, 'toUser:', toUser);
        if (!fromUser || !toUser){
            throw new BadRequestError('User not found');
        }

        //TODO: maybe I can just do Wallet.updateMany and set userId to toUserId?
        const fromUserWalletsCount = await Wallet.countDocuments({ userId: fromUserId });
        if (fromUserWalletsCount > 0){
            throw new BadRequestError('User has wallets');
        }

        //TODO: maybe I can just do UserTransaction.updateMany and set userId to toUserId?
        const fromUserTransactionsCount = await UserTransaction.countDocuments({ userId: fromUserId });
        if (fromUserTransactionsCount > 0){
            throw new BadRequestError('User has transactions');
        }

        //TODO: check traders. If user has traders - just move them to toUser

        LogManager.log('mergeUsers', 'fromUser.telegram:', fromUser.telegram, 'toUser.telegram:', toUser.telegram);
        if (fromUser.telegram?.id && toUser.telegram?.id){
            throw new BadRequestError('Both users have telegram connected');
        }

        toUser.telegram = toUser.telegram?.id ? toUser.telegram : fromUser.telegram;
        toUser.referralCode = !toUser.referralCode ? fromUser.referralCode : toUser.referralCode;
        toUser.email = toUser.email || fromUser.email;
        toUser.bots = toUser.bots || fromUser.bots;
        toUser.defaultBot = toUser.defaultBot || fromUser.defaultBot;

        await User.updateOne({ _id: fromUserId }, {
            $set: {
                telegramOld: fromUser.telegram,
                email: fromUser.email ? `DELETED: ${fromUser.email}` : undefined,
                referralCode: fromUser.referralCode ? `DELETED: ${fromUser.referralCode}` : undefined,
            },
            $unset: {
                telegram: 1,
            }
        });

        await User.updateOne({ _id: toUserId }, {
            $set: {
                telegram: toUser.telegram,
                referralCode: toUser.referralCode,
                email: toUser.email,
                bots: toUser.bots,
                defaultBot: toUser.defaultBot,
            }
        });

        await PushToken.updateMany({ userId: fromUserId }, {
            $set: {
                userId: toUserId,
            }
        });

        await Subscription.updateMany({ userId: fromUserId }, {
            $set: {
                userId: toUserId,
            }
        });
    }

    static async deleteUser(userId: string){
        await User.deleteOne({ _id: userId });
        await Subscription.deleteMany({ userId: userId });
        await PushToken.deleteMany({ userId: userId });
        await Wallet.deleteMany({ userId: userId });
        await UserTraderProfile.updateMany({ userId: userId }, { $set: { active: false } });
        await UserTransaction.deleteMany({ userId: userId });
    }

    static async revokeUser(userId: string){
        await Wallet.deleteMany({ userId: userId });
        await UserTraderProfile.updateMany({ userId: userId }, { $set: { active: false } });
        await UserTransaction.deleteMany({ userId: userId });
    }


}