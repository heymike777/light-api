import cron from 'node-cron';
import { TokenManager } from './TokenManager';
import { UserManager } from './UserManager';
import { YellowstoneManager } from '../services/solana/geyser/YellowstoneManager';
import { SubscriptionManager } from './SubscriptionManager';

export class CronManager {

    static async setup() {
        cron.schedule('*/10 * * * * *', () => {
            //TODO: for now it's every 10 seconds, but on productions set it to every second
            TokenManager.updateTokensPrices();
        })
    
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
            TokenManager.fetchNewPoolsForExistingTokens();
        });
    
    }

}