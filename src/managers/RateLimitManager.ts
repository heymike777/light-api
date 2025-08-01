import { ISubscription, SubscriptionTier } from "../entities/payments/Subscription";
import { BotManager } from "./bot/BotManager";
import { LogManager } from "./LogManager";
import { SubscriptionManager } from "./SubscriptionManager";

export interface IRateLimitedUser {
    tier: SubscriptionTier | 'free',
    minuteTxCount: number,
    hourTxCount: number,
    dayTxCount: number,
    rateLimitedUntil?: Date,
}

export class RateLimitManager {

    static minuteRateLimits: { [key: string]: number } = {
        ['free']: 30,
        [SubscriptionTier.SILVER]: 150,
        [SubscriptionTier.GOLD]: 300,
        [SubscriptionTier.PLATINUM]: 300,
    };
    static hourRateLimits: { [key: string]: number } = {
        ['free']: 160,
        [SubscriptionTier.SILVER]: 800,
        [SubscriptionTier.GOLD]: 1600,
        [SubscriptionTier.PLATINUM]: 2400,
    };
    static dayRateLimits: { [key: string]: number } = {
        ['free']: 10000,
        [SubscriptionTier.SILVER]: 20000,
        [SubscriptionTier.GOLD]: 30000,
        [SubscriptionTier.PLATINUM]: 40000,
    };
    static users: { [key: string]: IRateLimitedUser } = {}
    static subscriptions: { [key: string]: ISubscription } = {};

    static async fetchAllSubscriptions(){
        const subscriptions = await SubscriptionManager.getActiveSubscriptions();
        for (const subscription of subscriptions) {
            if (!this.subscriptions[subscription.userId] || SubscriptionManager.getTierImportance(subscription.tier) > SubscriptionManager.getTierImportance(this.subscriptions[subscription.userId].tier)){
                this.subscriptions[subscription.userId] = subscription;
            }
        }
    }

    static async cleanMinuteRateLimits(){
        LogManager.log('RateLimitManager - cleanMinuteRateLimits');
        try {
            for (const userId in this.users) {
                this.users[userId].minuteTxCount = 0;
            }
        } catch (error) {
            LogManager.error('RateLimitManager - cleanMinuteRateLimits', error);
        }
    }

    static async cleanHourRateLimits(){
        LogManager.log('RateLimitManager - cleanHourRateLimits');
        try {
            for (const userId in this.users) {
                this.users[userId].hourTxCount = 0;
            }
        } catch (error) {
            LogManager.error('RateLimitManager - cleanHourRateLimits', error);
        }
    }
    
    static async cleanDayRateLimits(){
        LogManager.log('RateLimitManager - cleanDayRateLimits');
        try {
            for (const userId in this.users) {
                this.users[userId].dayTxCount = 0;
            }
        } catch (error) {
            LogManager.error('RateLimitManager - cleanDayRateLimits', error);
        }
    }

    static receivedTransaction(userId: string, isTraderProfile: boolean): boolean {
        let user = this.users[userId];

        if (!user){
            user = {
                tier: this.subscriptions[userId]?.tier || 'free',
                minuteTxCount: 1,
                hourTxCount: 1,
                dayTxCount: 1,
                rateLimitedUntil: undefined,
            }
            this.users[userId] = user;
        } else {
            user.minuteTxCount++;
            user.hourTxCount++;
            user.dayTxCount++;
        }
        
        // console.log('RateLimitManager - receivedTransaction', userId, this.users[userId]);

        let result = true;
        const now = new Date();
        let isJustRateLimited = false;
        let rateLimitedFor: string | undefined;

        if (user.rateLimitedUntil && user.rateLimitedUntil < now){
            user.rateLimitedUntil = undefined;
        }

        if (user.rateLimitedUntil && user.rateLimitedUntil > now){
            result = false;
        }
        else if (user.dayTxCount > this.dayRateLimits[user.tier]){
            // stop following this user for 1 day.
            user.rateLimitedUntil = new Date(Date.now() + 1000 * 60 * 60 * 24);
            isJustRateLimited = true;
            rateLimitedFor = '24 hours';
            result = false;
        }
        else if (user.hourTxCount > this.hourRateLimits[user.tier]){
            // stop following this user for 1 hour.
            user.rateLimitedUntil = new Date(Date.now() + 1000 * 60 * 60);
            isJustRateLimited = true;
            rateLimitedFor = '1 hour';
            result = false;
        }
        else if (user.minuteTxCount > this.minuteRateLimits[user.tier]){
            // stop following this user for 1 minute.
            user.rateLimitedUntil = new Date(Date.now() + 1000 * 60 * 5);
            isJustRateLimited = true;
            rateLimitedFor = '5 minutes';
            result = false;
        }

        if (isJustRateLimited){
            const errorMessage = `🔴 You are rate limited for ${rateLimitedFor}. Please, upgrade your subscription to have higher limits.`;
            BotManager.sendPremiumError(userId, errorMessage);
        }

        return isTraderProfile ? true : result;
    }

}