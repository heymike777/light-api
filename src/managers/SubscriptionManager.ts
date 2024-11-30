import { Subscription, SubscriptionPlatform, SubscriptionStatus, SubscriptionTier } from "../entities/payments/Subscription";
import { MixpanelManager } from "./MixpanelManager";
import { RevenueCatManager } from "./RevenueCatManager";

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

        const now = new Date();
        if (subs.length > 0){
            for (const sub of subs) {
                await this.createSubscription(userId, sub.tier, SubscriptionPlatform.REVENUECAT, sub.expiresAt, now);
            }
        }

        await Subscription.deleteMany({ userId, platform: SubscriptionPlatform.REVENUECAT, createdAt: { $lt: now } });

        //TODO: remove subs with type=RevenueCat, userId, and createdAt < now


    }

}