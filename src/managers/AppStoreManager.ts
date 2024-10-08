import { AppStoreServerAPIClient, Environment, SendTestNotificationResponse } from "@apple/app-store-server-library"
import { readFileSync } from "fs";

export class AppStoreManager {

    static async sendTestPaymentWebhook() {
        const filePath = 'keys/SubscriptionKey_VXDQ9BS3R6.p8';
        const encodedKey = readFileSync(filePath).toString();
        const keyId = 'VXDQ9BS3R6';
        const issuerId = '81a5b015-01e1-4961-bfc3-932271536d67';
        const bundleId = 'xyz.heynova';
        const environment = process.env.ENVIRONMENT == 'PRODUCTION' ? Environment.PRODUCTION : Environment.SANDBOX;

        const client = new AppStoreServerAPIClient(encodedKey, keyId, issuerId, bundleId, environment)

        try {
            const response: SendTestNotificationResponse = await client.requestTestNotification()
            console.log('AppStoreManager', 'sendTestPaymentWebhook', response)
        } catch (e) {
            console.error('AppStoreManager', 'sendTestPaymentWebhook', e)
        }
    }

    // static async validateReceipt(receipt: string) {
    //     const filePath = 'keys/SubscriptionKey_VXDQ9BS3R6.p8';
    //     const encodedKey = readFileSync(filePath).toString();
    //     const keyId = 'VXDQ9BS3R6';
    //     const issuerId = '81a5b015-01e1-4961-bfc3-932271536d67';
    //     const bundleId = 'xyz.heynova';
    //     const environment = process.env.ENVIRONMENT == 'PRODUCTION' ? Environment.PRODUCTION : Environment.SANDBOX;

    //     const client = new AppStoreServerAPIClient(encodedKey, keyId, issuerId, bundleId, environment)

    //     try {
    //         client.
    //         const response: SendTestNotificationResponse = await client.requestTestNotification()
    //         console.log('AppStoreManager', 'sendTestPaymentWebhook', response)
    //     } catch (e) {
    //         console.error('AppStoreManager', 'sendTestPaymentWebhook', e)
    //     }
    // }


}