import cron from 'node-cron';
import { TokenManager } from './TokenManager';
import { UserManager } from './UserManager';
import { YellowstoneManager } from '../services/solana/geyser/YellowstoneManager';
import { SubscriptionManager } from './SubscriptionManager';
import { SwapManager } from './SwapManager';
import { WalletManager } from './WalletManager';
import { RedisManager } from './db/RedisManager';
import { EnvManager } from './EnvManager';
import { kSolAddress } from '../services/solana/Constants';
import { Chain } from '../services/solana/types';
import { TokenPriceManager } from './TokenPriceManager';
import { ReferralsManager } from './ReferralsManager';
import { HealthManager } from './HealthManager';
import { EventsManager } from './EventsManager';
import { FarmManager } from './FarmManager';
import { RateLimitManager } from './RateLimitManager';
import { LogManager } from './LogManager';
import { ChaosManager } from '../services/solana/svm/ChaosManager';

export class CronManager {

    static async setupCron() {
        if (EnvManager.isGeyserProcess){
            cron.schedule('* * * * *', () => {
                // every minute
                LogManager.forceLog('every minute');
                
                if (EnvManager.chain == Chain.SOLANA){
                    YellowstoneManager.cleanupProcessedSignatures();
                }

                RateLimitManager.cleanMinuteRateLimits();
            });

            cron.schedule('*/5 * * * *', () => {
                // every 5 minutes
                RateLimitManager.fetchAllSubscriptions();
            });

            cron.schedule('* * * * *', () => {
                // every hour
                RateLimitManager.cleanHourRateLimits
            });

            cron.schedule('0 0 * * *', () => {
                // every day at 00:00
                RateLimitManager.cleanDayRateLimits();
            });
        }

        if (EnvManager.isPricesProcess){
            cron.schedule('* * * * *', () => {
                TokenPriceManager.cleanOldCache();
                TokenPriceManager.updateNativeTokenPrices();
            });
        }

        if (EnvManager.isCronProcess){
            cron.schedule('* * * * * *', () => {
                this.cronEverySecond();
            });

            cron.schedule('*/10 * * * * *', () => {
                this.checkAndRetrySwaps();
            });
    
            cron.schedule('*/10 * * * *', () => {
                // every 10 minutes
                ReferralsManager.checkPendingRefPayouts();
            });

            cron.schedule('* * * * *', () => {
                // every minute
                LogManager.forceLog('every minute');

                TokenManager.updateTokenPrice(Chain.SOLANA, kSolAddress);

                // once a minute
                // TokenManager.fetchTokensInfo();
                UserManager.cleanOldCache();

                // TokenManager.updateTokenPairsLiquidity();//TODO: this should be every seconds on production once I setup dedicated RPC node
                // this.printStats();

                EventsManager.updateEventStatusses();

                ChaosManager.checkPendingStakes(5 * 60);
            });

            cron.schedule('0 * * * *', () => {
                // once an hour
                this.cronOnceAnHour();
            });

            cron.schedule('5 1 * * *', () => {
                // once a day at 1:05 am UTC
                this.cronAt1Am();
            });


            cron.schedule('5 2 * * *', () => {
                // once a day at 2:05 am UTC
                this.cronAt2Am();
            });
    
        }

        if (EnvManager.isMainProcess){
            cron.schedule('* * * * *', () => {
                LogManager.forceLog('every minute');

                TokenManager.fetchNativeTokenPriceFromRedis();

                WalletManager.fetchAllWalletAddresses(false);
            });
        }

        if (EnvManager.isTelegramProcess){
            cron.schedule('* * * * *', () => {
                LogManager.forceLog('every minute');

                this.cronEveryMinute();
            });
        }
    }

    static async cronAt1Am(){
        try {
            await ReferralsManager.recalcRefStats();
        } catch (error) {
            console.error('!cronAt1Am error1', error);
        }

        try {
            await UserManager.checkUsersWhoHasBlockedBot();
        } catch (error) {
            console.error('!cronAt1Am error2', error);
        }
    }

    static async cronAt2Am(){
        console.log('CronManager.cronAt2Am', 'Starting 2AM cron job at', new Date().toISOString());
        
        try {            
            console.log('CronManager.cronAt2Am', 'Fetching RevenueCat subscriptions...');
            await SubscriptionManager.fetchAllRevenueCatSubscriptions();
            console.log('CronManager.cronAt2Am', 'RevenueCat subscriptions fetched successfully');
        } catch (error) {
            console.error('CronManager.cronAt2Am error1 - RevenueCat subscriptions:', error);
            // Don't let this crash the entire cron job
        }

        try {            
            console.log('CronManager.cronAt2Am', 'Processing referral payouts...');
            await ReferralsManager.processRefPayouts();
            console.log('CronManager.cronAt2Am', 'Referral payouts processed successfully');
        } catch (error) {
            console.error('CronManager.cronAt2Am error2 - Referral payouts:', error);
            // Don't let this crash the entire cron job
        }

        console.log('CronManager.cronAt2Am', 'Completed 2AM cron job at', new Date().toISOString());
    }
    static async cronEveryMinute(){
        if (EnvManager.isTelegramProcess){
            try {
                await TokenManager.fetchNativeTokenPriceFromRedis();
            } catch (error) {
                console.error('!cronOnceAnHour error', error);
            }

            try {
                await HealthManager.checkTelegramBotHealth();
            } catch (error) {
                console.error('!cronOnceAnHour error', error);
            }
        }
    }

    static async cronOnceAnHour(){
        try {
            await RedisManager.migrateAllUsersTransactionsToMongo();
        } catch (error) {
            console.error('!cronOnceAnHour error', error);
        }

        try {
            await TokenManager.clearOldSwaps();
        } catch (error) {
            console.error('!cronOnceAnHour error', error);
        }

        try {
            await SubscriptionManager.cleanExpiredGiftCardSubscriptions();
        } catch (error) {
            console.error('!cronOnceAnHour error', error);
        }

        try {
            await TokenManager.refreshHotTokens();
        } catch (error) {
            console.error('!cronOnceAnHour error', error);
        }


        try {
            await EventsManager.recalculateLeaderboardForActiveEvents();
        } catch (error) {
            console.error('!cronOnceAnHour error', error);
        }
    }

    static async cronEverySecond() {
        try {
            await FarmManager.tick();
        } catch (error) {
            console.error('!cronEverySecond FarmManager error', error);
        }
    }

    static async checkAndRetrySwaps() {
        try {
            await SwapManager.checkPendingSwaps();
        } catch (error) {
            console.error('!checkAndRetrySwaps error1', error);
        }

        try {
            await SwapManager.retrySwaps();
        } catch (error) {
            console.error('!checkAndRetrySwaps error2', error);
        }
    }

    static async printStats(){
        console.log('!printStats at', new Date().toISOString());
        const arr: {userId: string, count: number}[] = [];
        let total = 0;
        for (const userId in WalletManager.stats) {
            const count = WalletManager.stats[userId];
            arr.push({userId: userId, count});
            total += count;
        }
        arr.sort((a, b) => b.count - a.count);
        
        let index = 0;
        arr.forEach((item) => {
            console.log(item.userId, item.count);
            index++;
            if (index >= 20){
                return;
            }
        });

        WalletManager.stats = {};
        WalletManager.statsStartedAt = Date.now();
    }

}