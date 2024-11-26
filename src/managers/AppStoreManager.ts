import { AppStoreServerAPIClient, AppTransaction, Environment, JWSRenewalInfoDecodedPayload, JWSTransactionDecodedPayload, ResponseBodyV2, ResponseBodyV2DecodedPayload, SignedDataVerifier } from "@apple/app-store-server-library"
import { readFileSync } from "fs";
import { SystemNotificationsManager } from "./SytemNotificationsManager";
import { PaymentLog } from "../entities/payments/PaymentLog";
import { IUser, User } from "../entities/User";

export interface DecodedReceipt {
    notification?: ResponseBodyV2DecodedPayload;
    transaction?: JWSTransactionDecodedPayload;
    renewalInfo?: JWSRenewalInfoDecodedPayload;
    appTransaction?: AppTransaction;
}

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

    static async receivedPaymentWebhook(signedPayload: string, userId?: string): Promise<boolean> {
        try {
            const decodedReceipt = await this.verifyAndDecodeReceipt(signedPayload);

            await PaymentLog.create({
                userId,
                platform: 'ios',
                data: { signedPayload, decodedReceipt },
                createdAt: new Date(),
            });

            if (!decodedReceipt) {
                console.log('!verifyAndDecodeReceipt failed', 'userId:', userId);
                return false;
            }            
            console.log('!verifyAndDecodeReceipt success', 'userId:', userId, 'decodedReceipt:',  decodedReceipt);
        
            return await this.handleNotification(decodedReceipt, userId);
        } catch (error) {
            console.error('AppStoreManager', 'receivedPaymentWebhook', 'Error processing notification:', error);
            return false;
        }
    }

    static async handleNotification(decodedReceipt: DecodedReceipt, userId?: string): Promise<boolean> {
        console.log("!handle notification:", decodedReceipt);

        let user: IUser | null = null;
        if (userId){
            user = await User.findById(userId);
        }

        SystemNotificationsManager.sendSystemMessage(`PAYMENT RECEIPT\nUser ID: ${userId}\nUser email: ${user?.email}\n\nReceipt: ${JSON.stringify(decodedReceipt, null, 2)}`);

        // const transactionInfo = jwt.decode(decodedPayload.data.signedTransactionInfo);
        // console.log(transactionInfo);

        // if (notificationType === "SUBSCRIBED" && subtype === "INITIAL_BUY") {
        //     await this.handleInitialPurchase(decodedPayload);
        // } 
        // else if (notificationType === "DID_RENEW") {
        //     await this.handleDidRenew(decodedPayload);
        // } 
        // else if (notificationType === "EXPIRED" && subtype === "VOLUNTARY") {
        //     await this.handleVoluntaryExpire(decodedPayload);
        // } 
        // else {
        //     console.error('AppStoreManager', 'receivedPaymentWebhook', 'Unknown notification type:', notificationType);
        // }


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

        return false;
    }

    // static async handleDidRenew(decodedPayload: any) {
    //     console.log("!handle Did Renew:", decodedPayload);
    //     const transactionInfo: any = jwt.decode(decodedPayload.data.signedTransactionInfo);

    //     if (transactionInfo && transactionInfo?.originalTransactionId){
    //         const newExpiresDate = new Date(transactionInfo?.expiresDate);   

    //         const subscription = await Subscription.findOne({ originalTransactionId: transactionInfo.originalTransactionId });
    //         if (subscription){
    //             subscription.expiresDate = newExpiresDate;
    //             subscription.isActive = newExpiresDate > new Date();
    //             if (subscription.ios){
    //                 subscription.ios.environment = transactionInfo.environment;
    //             }
    //             await subscription.save();

    //             SystemNotificationsManager.sendSystemMessage(`NULL renewed subscription\nID: ${transactionInfo.productId}\nExpiration: ${newExpiresDate.toISOString().substring(0, 10)}\nPrice: ${transactionInfo.price/1000} ${transactionInfo.currency}\nEnvironment: ${transactionInfo.environment}\nTransaction reason: ${transactionInfo.transactionReason}\nQuantity: ${transactionInfo.quantity}\nType: ${transactionInfo.type}\nIn-app ownership type: ${transactionInfo.inAppOwnershipType}\nStorefront: ${transactionInfo.storefront}`);
    //         }
    //         else {
    //             const newSubscription = await Subscription.create({
    //                 userId: '',//TODO: save user id
    //                 expiresDate: newExpiresDate,
    //                 isActive: newExpiresDate > new Date(),
    //                 ios: {
    //                     originalTransactionId: transactionInfo.originalTransactionId,
    //                     environment: transactionInfo.environment,
    //                 },
    //                 createdAt: new Date(),
    //             });


    //             SystemNotificationsManager.sendSystemMessage(`NULL renewed subscription\nID: ${transactionInfo.productId}\nExpiration: ${newExpiresDate.toISOString().substring(0, 10)}\nPrice: ${transactionInfo.price/1000} ${transactionInfo.currency}\nEnvironment: ${transactionInfo.environment}\nTransaction reason: ${transactionInfo.transactionReason}\nQuantity: ${transactionInfo.quantity}\nType: ${transactionInfo.type}\nIn-app ownership type: ${transactionInfo.inAppOwnershipType}\nStorefront: ${transactionInfo.storefront}`);
    //         }
    //     }

    //     console.log(transactionInfo);
    // }

    static async verifyAndDecodeReceipt(receipt: string): Promise<DecodedReceipt | undefined> {
        const verifier = new SignedDataVerifier(this.appleRootCAs, false, this.environment, this.bundleId, this.appAppleId)
        try {
            const notification = await verifier.verifyAndDecodeNotification(receipt);
            return { notification };
        } catch (e) {
            // console.error('!verifyAndDecodeNotification error(catched)', e);
        }

        try {
            const transaction = await verifier.verifyAndDecodeTransaction(receipt);
            return { transaction };
        } catch (e) {
            // console.error('!verifyAndDecodeTransaction error(catched)', e);
        }

        try {
            const renewalInfo = await verifier.verifyAndDecodeRenewalInfo(receipt);
            return { renewalInfo };
        } catch (e) {
            // console.error('!verifyAndDecodeRenewalInfo error(catched)', e);
        }

        try {
            const appTransaction = await verifier.verifyAndDecodeAppTransaction(receipt);
            return { appTransaction };
        } catch (e) {
            // console.error('!verifyAndDecodeAppTransaction error(catched)', e);
        }

        return undefined;
    }

}