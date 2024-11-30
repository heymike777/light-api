import { ISubscription, Subscription, SubscriptionPlatform, SubscriptionStatus, SubscriptionTier } from "../entities/payments/Subscription";
import { User } from "../entities/User";
import { Helpers } from "../services/helpers/Helpers";
import { BotManager } from "./bot/BotManager";
import { MixpanelManager } from "./MixpanelManager";
import { ISub, RevenueCatManager } from "./RevenueCatManager";

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

        console.log('SubscriptionManager', 'createSubscription', userId, tier, platform, expiresAt);
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

    static async updateUserSubscription(userId: string) {
        let subs = await RevenueCatManager.getCustomerSubscriptions(userId);
        if (subs == undefined){
            // try to fetch one more time
            subs = await RevenueCatManager.getCustomerSubscriptions(userId);
        }
        console.log('SubscriptionManager', 'updateUserSubscription', userId, subs);

        if (!subs){
            MixpanelManager.track('Error', userId, { text: 'Cannot fetch RevenueCat subscriptions for user' });
            console.error('Cannot fetch RevenueCat subscriptions for user', userId);
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

        this.sendSystemNotification(userId, subs, existingSubs);
    }

    static async sendSystemNotification(userId: string, subs: ISub[], existingSubs: ISubscription[]){
        // find the difference and send events to telegram bot
        const user = await User.findById(userId);
        const username = user?.email || user?.telegram?.username || `user_${userId}`;


        for (const existingSub of existingSubs) {
            const newSub = subs.find(s => s.tier == existingSub.tier);
            if (!newSub){
                const message = `${username} ${existingSub.tier} subscription canceled`;
                BotManager.sendSystemMessage(message);
            }
            else {
                const newExpiresAt = newSub.expiresAt.getTime();
                const existingExpiresAt = existingSub.expiresAt.getTime();
                if (newExpiresAt != existingExpiresAt){
                    const days = Math.floor((newExpiresAt - existingExpiresAt) / (1000 * 60 * 60 * 24));
                    const message = `${username} ${existingSub.tier} subscription extended by ${days} days`;
                    BotManager.sendSystemMessage(message);
                }
            }
        }

        const now = new Date();
        for (const sub of subs) {
            const existingSub = existingSubs.find(s => s.tier == sub.tier);
            if (!existingSub){
                const days = Math.floor((sub.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                const message = `${username} ${sub.tier} subscription started for ${days} days`;
                BotManager.sendSystemMessage(message);
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

}