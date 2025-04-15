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

export class CronManager {

    static async setupCron() {
        if (EnvManager.isGeyserProcess){
            cron.schedule('* * * * *', () => {
                if (EnvManager.chain == Chain.SOLANA){
                    YellowstoneManager.cleanupProcessedSignatures();
                }
                //TODO: need to cleanup for SONIC as well?
            });
        }

        if (EnvManager.isPricesProcess){
            cron.schedule('* * * * *', () => {
                TokenPriceManager.cleanOldCache();
            });
        }

        if (EnvManager.isCronProcess){
            cron.schedule('*/10 * * * * *', () => {
                this.checkAndRetrySwaps();
            });
    
            cron.schedule('*/10 * * * *', () => {
                // every 10 minutes
                RedisManager.migrateAllUsersTransactionsToMongo();
                ReferralsManager.checkPendingRefPayouts();
            });

            cron.schedule('* * * * *', () => {
                TokenManager.updateTokenPrice(Chain.SOLANA, kSolAddress);

                // once a minute
                // TokenManager.fetchTokensInfo();
                UserManager.cleanOldCache();

                // TokenManager.updateTokenPairsLiquidity();//TODO: this should be every seconds on production once I setup dedicated RPC node
                // this.printStats();
            });

            cron.schedule('0 * * * *', () => {
                // once an hour
                TokenManager.clearOldSwaps();
                SubscriptionManager.cleanExpiredGiftCardSubscriptions();
                ReferralsManager.recalcRefStats();
            });

            cron.schedule('5 2 * * *', () => {
                // once a day at 2:05 am UTC
                SubscriptionManager.fetchAllRevenueCatSubscriptions();
                ReferralsManager.processRefPayouts();
            });
    
        }

        if (EnvManager.isMainProcess){
            cron.schedule('* * * * *', () => {
                TokenManager.fetchSolPriceFromRedis();

                WalletManager.fetchAllWalletAddresses(false);
            });
        }

        if (EnvManager.isTelegramProcess){
            cron.schedule('* * * * *', () => {
                TokenManager.fetchSolPriceFromRedis();
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