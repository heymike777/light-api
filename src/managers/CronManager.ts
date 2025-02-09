import cron from 'node-cron';
import { TokenManager } from './TokenManager';
import { UserManager } from './UserManager';
import { YellowstoneManager } from '../services/solana/geyser/YellowstoneManager';
import { SubscriptionManager } from './SubscriptionManager';
import { SwapManager } from './SwapManager';
import { WalletManager } from './WalletManager';
import { RedisManager } from './db/RedisManager';

export class CronManager {

    static async setup() {
        cron.schedule('*/10 * * * * *', () => {
            TokenManager.updateTokensPrices();
            this.checkAndRetrySwaps();
        });

        cron.schedule('* * * * *', () => {
            // once a minute
            TokenManager.fetchTokensInfo();
            UserManager.cleanOldCache();
            YellowstoneManager.cleanupProcessedSignatures();

            // TokenManager.updateTokenPairsLiquidity();//TODO: this should be every seconds on production once I setup dedicated RPC node
            this.printStats();
        });

        cron.schedule('*/10 * * * *', () => {
            // every 10 minutes
            RedisManager.migrateAllUsersTransactionsToMongo();
        });

        cron.schedule('0 * * * *', () => {
            // once an hour
            TokenManager.clearOldSwaps();
            SubscriptionManager.cleanExpiredGiftCardSubscriptions();
        });

        cron.schedule('0 2 * * *', () => {
            // once a day at 2am UTC

            SubscriptionManager.fetchAllRevenueCatSubscriptions();
        });
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