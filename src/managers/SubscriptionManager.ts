import { Subscription, SubscriptionPlatform, SubscriptionStatus, SubscriptionTier } from "../entities/payments/Subscription";

export class SubscriptionManager {

    static async createSubscription(userId: string, tier: SubscriptionTier, platoform: SubscriptionPlatform, expiresAt: Date) {
        const subscription = new Subscription();
        subscription.userId = userId;
        subscription.tier = tier;
        subscription.expiresAt = expiresAt;
        subscription.platform = platoform
        subscription.status = SubscriptionStatus.ACTIVE;
        subscription.createdAt = new Date();
        await subscription.save();
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

}