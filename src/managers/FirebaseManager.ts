import admin from "firebase-admin";
import { PushToken } from "../entities/PushToken";
import { Message } from "firebase-admin/lib/messaging/messaging-api";

export interface PushNotificationMessage {
    token?: string;
    title: string;
    subtitle: string;
    image?: string;
    data?: {
        open?: 'transactions' | 'airdrops' | 'profile'
    };
  }

export class FirebaseManager {
    constructor(){
        var serviceAccount = require("../../keys/firebase-adminsdk.json");
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    }

    async sendMessage(data: PushNotificationMessage){
        // This registration token comes from the client FCM SDKs.
        if (!data.token){
            console.error('Invalid token');
            return;
        }

        const message: Message = {
            token: data.token,
            notification: {
                title: data.title,
                body: data.subtitle,
            },
            android: {
                notification: {
                    imageUrl: data.image,
                }
            },
            apns: {
                payload: {
                    aps: {
                        badge: 1,
                        sound: 'default',
                        contentAvailable: true,
                        mutableContent: true,
                    },
                },
                fcmOptions: {
                    imageUrl: data.image,
                }
              },
            data: data.data,
        };

        // Send a message to the device corresponding to the provided
        // registration token.
        admin.messaging().send(message)
            .then((response: any) => {
                // Response is a message ID string.
                console.log('Successfully sent message:', response);
            })
            .catch((error: any) => {
                if (error.errorInfo.code === 'messaging/registration-token-not-registered'){
                    console.log('Token not registered');
                    if (data.token) { FirebaseManager.deletePushToken(data.token); }
                }
                else {
                    console.log('Error sending message:', error);
                }
            });
    }


    // STATIC METHODS

    static instance: FirebaseManager;

    static getInstance() {
        if (!FirebaseManager.instance) {
            FirebaseManager.instance = new FirebaseManager();
        }
        return FirebaseManager.instance;
    }

    static async savePushToken(userId: string, deviceId: string, token: string, platform?: string) {
        const existingPushToken = await PushToken.findOne({ deviceId });
        if (existingPushToken){
            let shouldUpdate = false;

            if (existingPushToken.userId != userId){
                existingPushToken.userId = userId;
                shouldUpdate = true;
            }
            if (existingPushToken.token != token){
                existingPushToken.token = token;
                shouldUpdate = true;
            }
            if (existingPushToken.platform != platform){
                existingPushToken.platform = platform;
                shouldUpdate = true;
            }
            if (shouldUpdate){
                await existingPushToken.save();
            }

            return;
        }

        const pushToken = new PushToken();
        pushToken.userId = userId;
        pushToken.deviceId = deviceId;
        pushToken.token = token;
        pushToken.platform = platform
        pushToken.createdAt = new Date();
        await pushToken.save();
    }

    static async deletePushTokens(userId: string, deviceId: string) {
        await PushToken.deleteMany({ userId, deviceId });
    }

    static async deletePushToken(token: string) {
        await PushToken.deleteMany({ token });
    }

    static async sendPushToUser(userId: string, title: string, subtitle?: string, image?: string, data?: PushNotificationMessage['data']): Promise<boolean> {
        console.log('sendPushToUser', userId, title, subtitle, data);
        try {
            const firebaseManager = FirebaseManager.getInstance();

            const pushTokens = await PushToken.find({ userId: userId });
            console.log('pushTokens', pushTokens);

            if (pushTokens.length == 0){
                console.log('No push tokens found for user', userId);
                return false;
            }
            
            for (const pushToken of pushTokens){
                const message: PushNotificationMessage = {
                    token: pushToken.token,
                    title: title,
                    subtitle: subtitle || '',
                    data: data,
                    image: image,
                };

                await firebaseManager.sendMessage(message);
            }

            return true;
        }
        catch (error){
            console.error('sendPushToUser', userId, error);
        }

        return false;
    }

}