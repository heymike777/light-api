import { AppStoreServerAPIClient, Environment, SendTestNotificationResponse } from "@apple/app-store-server-library"
import { readFileSync } from "fs";
import jwt from "jsonwebtoken";

export class AppStoreManager {

    static async sendTestPaymentWebhook() {
        const filePath = 'keys/SubscriptionKey_VXDQ9BS3R6.p8';
        const encodedKey = readFileSync(filePath).toString();
        const keyId = 'VXDQ9BS3R6';
        const issuerId = '81a5b015-01e1-4961-bfc3-932271536d67';
        const bundleId = 'xyz.heynova';
        const environment = process.env.ENVIRONMENT == 'PRODUCTION' ? Environment.PRODUCTION : Environment.SANDBOX;

        const client = new AppStoreServerAPIClient(encodedKey, keyId, issuerId, bundleId, environment);

        try {
            const response: SendTestNotificationResponse = await client.requestTestNotification()
            console.log('AppStoreManager', 'sendTestPaymentWebhook', response)
        } catch (e) {
            console.error('AppStoreManager', 'sendTestPaymentWebhook', e)
        }
    }

    static async receivedPaymentWebhook(body: any, isSandbox: boolean) {
        try {
            const signedPayload = body.signedPayload;
            const decodedPayload: any = jwt.decode(signedPayload);

            console.log('AppStoreManager', 'receivedPaymentWebhook', 'decodedPayload:', decodedPayload);

            if (decodedPayload?.data?.bundleId != 'xyz.heynova') {
                console.error('AppStoreManager', 'receivedPaymentWebhook', 'Invalid bundleId:', decodedPayload?.data?.bundleId);
                return false;
            }

            if (isSandbox && decodedPayload?.data?.environment != 'Sandbox') {
                console.error('AppStoreManager', 'receivedPaymentWebhook', 'Invalid environment:', decodedPayload?.data?.environment);
                return false;
            }

            if (!isSandbox && decodedPayload?.data?.environment != 'Production') {
                console.error('AppStoreManager', 'receivedPaymentWebhook', 'Invalid environment:', decodedPayload?.data?.environment);
                return false;
            }
        
            // decoded signedPayload contains "notificationType" property to determine the type of event.
            const notificationType = decodedPayload?.notificationType;
        
            // subtype is also used to determine type of event
            const subtype = decodedPayload?.subtype;
        
            if (notificationType === "SUBSCRIBED" && subtype === "INITIAL_BUY") {
                this.handleInitialPurchase(decodedPayload);
            } 
            else if (notificationType === "DID_RENEW") {
                this.handleDidRenew(decodedPayload);
            } 
            else if (notificationType === "EXPIRED" && subtype === "VOLUNTARY") {
                this.handleVoluntaryExpire(decodedPayload);
            } 
            else {
                console.error('AppStoreManager', 'receivedPaymentWebhook', 'Unknown notification type:', notificationType);
            }

            return true;
        } catch (error) {
            console.error('AppStoreManager', 'receivedPaymentWebhook', 'Error processing notification:', error);
            return false;
        }
    }

    static handleInitialPurchase(decodedPayload: any) {
        console.log("!handle Initial purchase:", decodedPayload);
        const transactionInfo = jwt.decode(decodedPayload.data.signedTransactionInfo);
        console.log(transactionInfo);
    }

    static handleDidRenew(decodedPayload: any) {
        console.log("!handle Did Renew:", decodedPayload);
        const transactionInfo = jwt.decode(decodedPayload.data.signedTransactionInfo);
        console.log(transactionInfo);
    }

    static handleVoluntaryExpire(decodedPayload: any) {
        console.log("!handle Voluntary Expire:", decodedPayload);
        const transactionInfo = jwt.decode(decodedPayload.data.signedTransactionInfo);
        console.log(transactionInfo);
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