import axios from "axios";
import { SubscriptionTier } from "../entities/payments/Subscription";
import { LogManager } from "./LogManager";

export interface ISub {
    tier: SubscriptionTier, 
    expiresAt: Date,
}

export class RevenueCatManager {

    static kBaseUrl = 'https://api.revenuecat.com/v2';
    static kApiKey = process.env.REVENUE_CAT_API_KEY;
    static kProjectId = process.env.REVENUE_CAT_PROJECT_ID;
    static entitlements: {[key: string]: { tier: SubscriptionTier }} = {
        'entl104c1dc24b': { tier: SubscriptionTier.SILVER },
        'entla5e57aacb7': { tier: SubscriptionTier.GOLD },
        'entl487e7353d2': { tier: SubscriptionTier.PLATINUM },
    }

    static async getCustomerSubscriptions(userId: string): Promise<ISub[] | undefined> {
        try {
            const url = `${this.kBaseUrl}/projects/${this.kProjectId}/customers/${userId}`;
            const response = await axios.get(url, {
                headers: {
                    Authorization: `Bearer ${this.kApiKey}`,
                }
            });

            const activeEntitlements = response.data.active_entitlements;
            const subscriptions: ISub[] = [];
            LogManager.log('RevenueCat', 'getCustomer', userId, 'activeEntitlements:', JSON.stringify(activeEntitlements));
            if (activeEntitlements && activeEntitlements.items && activeEntitlements.items.length > 0){
                for (const item of activeEntitlements.items) {
                    const entitlement = this.entitlements[item.entitlement_id];
                    LogManager.log('RevenueCat', 'entitlement', entitlement);
                    if (entitlement){
                        const expiresAt = new Date(item.expires_at);  
                        subscriptions.push({tier: entitlement.tier, expiresAt});                      
                    }
                    else {
                        LogManager.error('Unknown entitlement', item.entitlement_id);
                    }
                }
            }

            return subscriptions;
        }
        catch (error) {
            LogManager.error('RevenueCat', 'getCustomer', error);
        }

        return undefined;
    }


}