import { AppStoreServerAPIClient, Environment, SendTestNotificationResponse, SignedDataVerifier } from "@apple/app-store-server-library"
import { readFileSync } from "fs";
import jwt from "jsonwebtoken";
import { AppleLog } from "../entities/payments/AppleLog";
import { PaymentEnvironment, Subscription } from "../entities/payments/Subscription";
import { SystemNotificationsManager } from "./SytemNotificationsManager";

export class AppStoreManager {
    static bundleId = 'xyz.heynova';
    static environment = Environment.SANDBOX;
    static appAppleId = 6736581652;
    static appleRootCAs: Buffer[] = this.loadRootCAs() 

    static loadRootCAs(): Buffer[] {
        const appleRoot = readFileSync('keys/AppleRootCA-G3.cer');
        const appleRoot2 = readFileSync('keys/AppleRootCA-G2.cer');
        return [appleRoot, appleRoot2];
    }

    // static async sendTestPaymentWebhook() {
    //     const filePath = 'keys/SubscriptionKey_VXDQ9BS3R6.p8';
    //     const encodedKey = readFileSync(filePath).toString();
    //     const keyId = 'VXDQ9BS3R6';
    //     const issuerId = '81a5b015-01e1-4961-bfc3-932271536d67';
    //     const environment = process.env.ENVIRONMENT == 'PRODUCTION' ? Environment.PRODUCTION : Environment.SANDBOX;

    //     const client = new AppStoreServerAPIClient(encodedKey, keyId, issuerId, this.bundleId, environment);

    //     try {
    //         const response: SendTestNotificationResponse = await client.requestTestNotification()
    //         console.log('AppStoreManager', 'sendTestPaymentWebhook', response)
    //     } catch (e) {
    //         console.error('AppStoreManager', 'sendTestPaymentWebhook', e)
    //     }
    // }

    static async receivedPaymentWebhook(body: any, isSandbox: boolean) {
        try {
            const signedPayload = body.signedPayload;

            const decodedPayload1: any = jwt.decode(signedPayload);
            console.log('!AppStoreManager', 'receivedPaymentWebhook', 'decodedPayload:', decodedPayload1);
            return undefined;

            const isVerified = await this.verifyReceipt(signedPayload);
            if (!isVerified) {
                console.log('!verifyReceipt failed');
                console.error('!apple webhook error(catched)', 'AppStoreManager', 'receivedPaymentWebhook', 'Invalid signedPayload:', signedPayload);
                return false;
            }
            console.log('!verifyReceipt success');

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
        
            //TODO: parse the payload and update the payment & user records

            if (notificationType === "SUBSCRIBED" && subtype === "INITIAL_BUY") {
                await this.handleInitialPurchase(decodedPayload);
            } 
            else if (notificationType === "DID_RENEW") {
                await this.handleDidRenew(decodedPayload);
            } 
            else if (notificationType === "EXPIRED" && subtype === "VOLUNTARY") {
                await this.handleVoluntaryExpire(decodedPayload);
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

    static async handleInitialPurchase(decodedPayload: any) {
        console.log("!handle Initial purchase:", decodedPayload);
        const transactionInfo = jwt.decode(decodedPayload.data.signedTransactionInfo);
        console.log(transactionInfo);



        // {
        //     "originalTransactionId" : "0",
        //     "subscriptionGroupIdentifier" : "21554286",
        //     "signedDate" : 1729743617349,
        //     "bundleId" : "xyz.heynova",
        //     "currency" : "USD",
        //     "deviceVerificationNonce" : "adc4fbcf-f028-4bba-b3b9-6ff8b7911d80",
        //     "expiresDate" : 1732350848620,
        //     "deviceVerification" : "G+8Sozy90rTOQ73VbyGF5DmoCQCmyho3vXfq7wz6YFYdSgD0aTZo4Qah8ZpBc4Dh",
        //     "isUpgraded" : false,
        //     "productId" : "nova.pro.monthly",
        //     "storefrontId" : "143441",
        //     "originalPurchaseDate" : 1729668848620,
        //     "type" : "Auto-Renewable Subscription",
        //     "transactionId" : "0",
        //     "storefront" : "USA",
        //     "webOrderLineItemId" : "0",
        //     "quantity" : 1,
        //     "transactionReason" : "PURCHASE",
        //     "inAppOwnershipType" : "PURCHASED",
        //     "purchaseDate" : 1729668848620,
        //     "environment" : "Xcode",
        //     "price" : 19990
        //   }
    }

    static async handleDidRenew(decodedPayload: any) {
        console.log("!handle Did Renew:", decodedPayload);
        const transactionInfo: any = jwt.decode(decodedPayload.data.signedTransactionInfo);

        await AppleLog.create({
            userId: '',//TODO: save user id
            originalTransactionId: transactionInfo?.originalTransactionId,
            data: transactionInfo,
            createdAt: new Date(),
        });

        if (transactionInfo && transactionInfo?.originalTransactionId){
            const newExpiresDate = new Date(transactionInfo?.expiresDate);   

            const subscription = await Subscription.findOne({ originalTransactionId: transactionInfo.originalTransactionId });
            if (subscription){
                subscription.expiresDate = newExpiresDate;
                subscription.isActive = newExpiresDate > new Date();
                if (subscription.ios){
                    subscription.ios.environment = transactionInfo.environment == 'Sandbox' ? PaymentEnvironment.SANDBOX : PaymentEnvironment.PRODUCTION;
                }
                await subscription.save();

                SystemNotificationsManager.sendSystemMessage(`NULL renewed subscription\nID: ${transactionInfo.productId}\nExpiration: ${newExpiresDate.toISOString().substring(0, 10)}\nPrice: ${transactionInfo.price/1000} ${transactionInfo.currency}\nEnvironment: ${transactionInfo.environment}\nTransaction reason: ${transactionInfo.transactionReason}\nQuantity: ${transactionInfo.quantity}\nType: ${transactionInfo.type}\nIn-app ownership type: ${transactionInfo.inAppOwnershipType}\nStorefront: ${transactionInfo.storefront}`);
            }
            else {
                const newSubscription = await Subscription.create({
                    userId: '',//TODO: save user id
                    expiresDate: newExpiresDate,
                    isActive: newExpiresDate > new Date(),
                    ios: {
                        originalTransactionId: transactionInfo.originalTransactionId,
                        environment: transactionInfo.environment == 'Sandbox' ? PaymentEnvironment.SANDBOX : PaymentEnvironment.PRODUCTION,
                    },
                    createdAt: new Date(),
                });


                SystemNotificationsManager.sendSystemMessage(`NULL renewed subscription\nID: ${transactionInfo.productId}\nExpiration: ${newExpiresDate.toISOString().substring(0, 10)}\nPrice: ${transactionInfo.price/1000} ${transactionInfo.currency}\nEnvironment: ${transactionInfo.environment}\nTransaction reason: ${transactionInfo.transactionReason}\nQuantity: ${transactionInfo.quantity}\nType: ${transactionInfo.type}\nIn-app ownership type: ${transactionInfo.inAppOwnershipType}\nStorefront: ${transactionInfo.storefront}`);
            }
        }

        // {
        //     transactionId: '2000000748768559',
        //     originalTransactionId: '2000000748766388',
        //     productId: 'nova.pro.monthly',
        //     expiresDate: 1729444735000,
        //     environment: 'Sandbox',
        //     transactionReason: 'RENEWAL',
        //     price: 22990,
        //     currency: 'USD'

        //     webOrderLineItemId: '2000000078043469',
        //     bundleId: 'xyz.heynova',
        //     subscriptionGroupIdentifier: '21554286',
        //     purchaseDate: 1729444435000,
        //     originalPurchaseDate: 1729443835000,
        //     quantity: 1,
        //     type: 'Auto-Renewable Subscription',
        //     inAppOwnershipType: 'PURCHASED',
        //     signedDate: 1729444385239,
        //     storefront: 'UKR',
        //     storefrontId: '143492',
        //   }

        console.log(transactionInfo);
    }

    static async handleVoluntaryExpire(decodedPayload: any) {
        console.log("!handle Voluntary Expire:", decodedPayload);
        const transactionInfo = jwt.decode(decodedPayload.data.signedTransactionInfo);
        console.log(transactionInfo);
    }

    static async verifyReceipt(receipt: string): Promise<boolean> {
        const verifier = new SignedDataVerifier(this.appleRootCAs, false, this.environment, this.bundleId, this.appAppleId)
        try {
            const decodedNotification = await verifier.verifyAndDecodeNotification(receipt);
            console.log('!decodedNotification', decodedNotification);
            return true;
        } catch (e) {
            console.error('!verifyReceipt error(catched)', e);
            return false;
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