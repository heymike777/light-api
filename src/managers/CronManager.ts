import cron from 'node-cron';
import { TokenManager } from './TokenManager';
import { UserManager } from './UserManager';
import { YellowstoneManager } from '../services/solana/geyser/YellowstoneManager';
import { SubscriptionManager } from './SubscriptionManager';
import { SwapManager } from './SwapManager';

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

            TokenManager.updateTokenPairsLiquidity();//TODO: this should be every seconds on production once I setup dedicated RPC node
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

}