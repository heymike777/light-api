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

export class CronManager {

    static async setupCron() {
        if (EnvManager.isGeyserProcess){
            cron.schedule('* * * * *', () => {
                if (EnvManager.chain == Chain.SOLANA){
                    YellowstoneManager.cleanupProcessedSignatures();

                    const stats: { pubkey: string, count: number, perMinute: number }[] = [];
                    for (const pubkey in YellowstoneManager.walletsStats) {
                        const count = YellowstoneManager.walletsStats[pubkey];
                        const perMinute = Math.floor(count / ((Date.now() - YellowstoneManager.walletsStatsStartDate.getTime()) / 1000 / 60));
                        stats.push({ pubkey, count, perMinute });
                    }
                    stats.sort((a, b) => b.count - a.count);
                    console.log('!geyser stats', stats);
                }
            });
        }

        if (EnvManager.isPricesProcess){
            cron.schedule('* * * * *', () => {
                TokenPriceManager.cleanOldCache();
                TokenPriceManager.updateNativeTokenPrices();
            });
        }

        if (EnvManager.isCronProcess){
            cron.schedule('*/10 * * * * *', () => {
                this.checkAndRetrySwaps();
            });
    
            cron.schedule('*/10 * * * *', () => {
                // every 10 minutes
                ReferralsManager.checkPendingRefPayouts();
            });

            cron.schedule('* * * * *', () => {
                // every minute
                TokenManager.updateTokenPrice(Chain.SOLANA, kSolAddress);

                // once a minute
                // TokenManager.fetchTokensInfo();
                UserManager.cleanOldCache();

                // TokenManager.updateTokenPairsLiquidity();//TODO: this should be every seconds on production once I setup dedicated RPC node
                // this.printStats();

                EventsManager.updateEventStatusses();
            });

            cron.schedule('0 * * * *', () => {
                // once an hour
                RedisManager.migrateAllUsersTransactionsToMongo();
                TokenManager.clearOldSwaps();
                SubscriptionManager.cleanExpiredGiftCardSubscriptions();
                TokenManager.refreshHotTokens();
            });

            cron.schedule('5 1 * * *', () => {
                // once a day at 1:05 am UTC
                ReferralsManager.recalcRefStats();
                UserManager.checkUsersWhoHasBlockedBot();
            });


            cron.schedule('5 2 * * *', () => {
                // once a day at 2:05 am UTC
                SubscriptionManager.fetchAllRevenueCatSubscriptions();
                ReferralsManager.processRefPayouts();
            });
    
        }

        if (EnvManager.isMainProcess){
            cron.schedule('* * * * *', () => {
                TokenManager.fetchNativeTokenPriceFromRedis();

                WalletManager.fetchAllWalletAddresses(false);
            });
        }

        if (EnvManager.isTelegramProcess){
            cron.schedule('* * * * *', () => {
                TokenManager.fetchNativeTokenPriceFromRedis();
                HealthManager.checkTelegramBotHealth();
            });
        }
    }

    static async checkAndRetrySwaps() {
        await SwapManager.checkPendingSwaps();
        await SwapManager.retrySwaps();
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