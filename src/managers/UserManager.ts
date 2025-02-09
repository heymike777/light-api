import { ISubscription, Subscription, SubscriptionStatus, SubscriptionTier } from "../entities/payments/Subscription";
import { UserTraderProfile } from "../entities/users/TraderProfile";
import { IUser, TelegramUser, User } from "../entities/users/User";
import { UserTransaction } from "../entities/users/UserTransaction";
import { LogManager } from "./LogManager";
import { MixpanelManager } from "./MixpanelManager";
import { SubscriptionManager } from "./SubscriptionManager";
import { SystemNotificationsManager } from "./SytemNotificationsManager";
import { TraderProfilesManager } from "./TraderProfilesManager";

export class UserManager {

    static cachedUsers: {user: IUser, createdAt: Date}[] = [];

    static async getUserById(id: string, forceCleanCache = false): Promise<IUser> {
        const times: {time: number, message: string, took: number}[] = [];
        times.push({time: Date.now(), message: "start", took: 0});

        if (!forceCleanCache){
            const cachedUser = this.cachedUsers.find(cachedUser => cachedUser.user.id == id);
            if (cachedUser){
                return cachedUser.user;
            }
        }

        const now = new Date();
        const user = await User.findById(id);
        times.push({time: Date.now(), message: "got user by id", took: Date.now()-times[times.length-1].time});
        if (user){
            await UserManager.fillUserWithData(user);
            times.push({time: Date.now(), message: "filled user", took: Date.now()-times[times.length-1].time});
            this.cachedUsers.push({ user: user, createdAt: now });
            times.push({time: Date.now(), message: `pushed user to cache (count=${this.cachedUsers.length})`, took: Date.now()-times[times.length-1].time});

            user.tmp = times;
            return user;
        }
        else {
            throw new Error('User not found');
        }
    }

    static async getUserByTelegramUser(from: TelegramUser, forceCleanCache = false): Promise<IUser> {
        if (!forceCleanCache){
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

            this.cachedUsers.push({ user: user, createdAt: now });
            return user;
        }
        else {
            const newUser = await User.create({
                telegram: from,
                createdAt: now,
            });

            MixpanelManager.updateProfile(newUser, undefined);

            let fullName = from.first_name || '' + (from.last_name ? ' ' + from.last_name : '');
            fullName = fullName.trim();
            SystemNotificationsManager.sendSystemMessage(`New user: @${from.username} (${fullName})`);

            this.cachedUsers.push({ user: newUser, createdAt: now });
            return newUser;
        }
    }

    static async cleanOldUserTransactions(userId: string) {
        const count = await UserTransaction.countDocuments({ userId: userId });
        console.log('user', userId, 'UserTransaction.count', count);

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
                console.log('user', userId, 'deleted', tmp.deletedCount, 'transactions');
                index++;
            }
        }
    }

    // static async getUserByEmail(email: string): Promise<IUser> {
    //     const cachedUser = this.cachedUsers.find(cachedUser => cachedUser.user.email === email);
    //     if (cachedUser){
    //         return cachedUser.user;
    //     }

    //     const now = new Date();
    //     const user = await User.findOne({ 'email': email });
    //     if (user){
    //         await UserManager.fillUserWithData(user);
    //         this.cachedUsers.push({ user: user, createdAt: now });
    //         return user;
    //     }
    //     else {
    //         const newUser = await User.create({
    //             email: email,
    //             createdAt: now,
    //         });

    //         MixpanelManager.updateProfile(newUser, undefined);
            
    //         SystemNotificationsManager.sendSystemMessage(`New user: ${email}`);

    //         this.cachedUsers.push({ user: newUser, createdAt: now });
    //         return newUser;
    //     }
    // }

    static async cleanOldCache(){
        const now = new Date();
        this.cachedUsers = this.cachedUsers.filter(cachedUser => now.getTime() - cachedUser.createdAt.getTime() < 1000 * 60 * 5);
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

}