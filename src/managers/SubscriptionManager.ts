import { ISubscription, Subscription, SubscriptionPeriod, SubscriptionPlatform, SubscriptionStatus, SubscriptionTier } from "../entities/payments/Subscription";
import { IUser, User } from "../entities/users/User";
import { Wallet, WalletStatus } from "../entities/Wallet";
import { Helpers } from "../services/helpers/Helpers";
import { LogManager } from "./LogManager";
import { MixpanelManager } from "./MixpanelManager";
import { ISub, RevenueCatManager } from "./RevenueCatManager";
import { SystemNotificationsManager } from "./SytemNotificationsManager";
import { UserManager } from "./UserManager";
import { WalletManager } from "./WalletManager";

export class SubscriptionManager {

    static async createSubscription(userId: string, tier: SubscriptionTier, platform: SubscriptionPlatform, expiresAt: Date, createdAt: Date) {
        const subscription = new Subscription();
        subscription.userId = userId;
        subscription.tier = tier;
        subscription.expiresAt = expiresAt;
        subscription.platform = platform;
        subscription.status = SubscriptionStatus.ACTIVE;
        subscription.createdAt = createdAt;
        await subscription.save();

        LogManager.log('SubscriptionManager', 'createSubscription', userId, tier, platform, expiresAt);
    }

    static getMaxNumberOfWallets(tier?: SubscriptionTier): number {
        if (tier == SubscriptionTier.PLATINUM){
            return 1000;
        }
        else if (tier == SubscriptionTier.GOLD){
            return 500;
        }
        else if (tier == SubscriptionTier.SILVER){
            return 100;
        }
        
        return 10;
    }

    static getMaxNumberOfTraderProfiles(tier?: SubscriptionTier): number {
        if (tier == SubscriptionTier.PLATINUM){
            return 50;
        }
        else if (tier == SubscriptionTier.GOLD){
            return 10;
        }
        else if (tier == SubscriptionTier.SILVER){
            return 5;
        }
        
        return 2;
    }

    static async updateUserSubscription(userId: string) {
        try {
            let subs = await RevenueCatManager.getCustomerSubscriptions(userId);
            if (subs == undefined){
                // try to fetch one more time
                subs = await RevenueCatManager.getCustomerSubscriptions(userId);
            }
            LogManager.log('SubscriptionManager', 'updateUserSubscription', userId, subs);

            if (!subs){
                MixpanelManager.trackError(userId, { text: 'Cannot fetch RevenueCat subscriptions for user' });
                LogManager.error('Cannot fetch RevenueCat subscriptions for user', userId);
                return;
            }

            const existingSubs = await Subscription.find({ userId, platform: SubscriptionPlatform.REVENUECAT, status: SubscriptionStatus.ACTIVE });

            const now = new Date();
            if (subs.length > 0){
                for (const sub of subs) {
                    await this.createSubscription(userId, sub.tier, SubscriptionPlatform.REVENUECAT, sub.expiresAt, now);
                }
            }

            await Subscription.deleteMany({ userId, platform: SubscriptionPlatform.REVENUECAT, createdAt: { $lt: now } });
            
            const user = await this.updateUserSubscriptionStatus(userId);

            this.sendSystemNotification(user, subs, existingSubs);
        }
        catch (error){
            LogManager.error('SubscriptionManager.updateUserSubscription', 'userId:', userId, 'error:', error);
        }
    }

    static async updateUserSubscriptionStatus(userId: string): Promise<IUser | undefined> {
        const user = await User.findById(userId);
        if (user){
            await UserManager.fillUserWithData(user);

            // check if user has a subscription and update the number of wallets
            const tier = user.subscription?.tier;
            const maxNumberOfWallets = this.getMaxNumberOfWallets(tier);
            const wallets = await Wallet.find({ userId });
            if (wallets.length > maxNumberOfWallets){
                const walletsToPause = wallets.slice(maxNumberOfWallets);
                for (const wallet of walletsToPause){
                    await WalletManager.pauseWallet(wallet);
                }
            }
            else {
                for (const wallet of wallets) {
                    await WalletManager.activateWallet(wallet);
                }
            }

            return user;
        }
        else {
            MixpanelManager.trackError(userId, { text: 'Cannot find user' });
        }
    }

    static async cleanExpiredGiftCardSubscriptions() {
        const now = new Date();
        await Subscription.deleteMany({ platform: SubscriptionPlatform.GIFT_CARD, expiresAt: { $lt: now } });
    }

    static async sendSystemNotification(user: IUser | undefined, subs: ISub[], existingSubs: ISubscription[]){
        // find the difference and send events to telegram bot
        const username = user?.email || user?.telegram?.username || `user_${user?.id || 'unknown'}`;

        for (const existingSub of existingSubs) {
            const newSub = subs.find(s => s.tier == existingSub.tier);
            if (!newSub){
                const message = `${username} ${existingSub.tier} subscription canceled`;
                SystemNotificationsManager.sendSystemMessage(message);
            }
            else {
                const newExpiresAt = newSub.expiresAt.getTime();
                const existingExpiresAt = existingSub.expiresAt.getTime();
                if (newExpiresAt != existingExpiresAt){
                    const dateString = Helpers.dateDiffString(newSub.expiresAt, existingSub.expiresAt);
                    const message = `${username} ${existingSub.tier} subscription extended by ${dateString}`;
                    SystemNotificationsManager.sendSystemMessage(message);
                }
            }
        }

        const now = new Date();
        for (const sub of subs) {
            const existingSub = existingSubs.find(s => s.tier == sub.tier);
            if (!existingSub){
                const dateString = Helpers.dateDiffString(sub.expiresAt, now);

                const message = `${username} ${sub.tier} subscription started for ${dateString}`;
                SystemNotificationsManager.sendSystemMessage(message);
            }
        }
    }

    static async fetchAllRevenueCatSubscriptions() {
        const users = await User.find({ email: { $exists: true } });
        //TODO: once I have 10k+ users, I will need to refactor this. And fetch all users in chunks to speed up the process
        for (const user of users) {
            await this.updateUserSubscription(user.id);
            await Helpers.sleep(0.5);
        }
    }

    static getTierImportance(tier: SubscriptionTier): number {
        if (tier == SubscriptionTier.PLATINUM){
            return 3;
        }
        else if (tier == SubscriptionTier.GOLD){
            return 2;
        }
        else if (tier == SubscriptionTier.SILVER){
            return 1;
        }
        
        return 0;
    }

    static getPrices(): { [key: string]: { month: number, year: number } } {
        return {
            silver: { month: 15, year: 99 },
            gold: { month: 49, year: 299 },
            platinum: { month: 99, year: 499 },
        };
    }

    static async buyWithCrypto(user: IUser, tier: SubscriptionTier, period: SubscriptionPeriod) {

}