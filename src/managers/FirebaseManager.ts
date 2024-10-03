import admin from "firebase-admin";
import { PushToken } from "../entities/PushToken";

export interface PushNotificationMessage {
    token?: string;
    title: string;
    subtitle: string;
    data?: {
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

        const message = {
            token: data.token,
            notification: {
                title: data.title,
                body: data.subtitle,
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

    static async savePushToken(userId: string, deviceId: string, token: string) {
        const existingPushToken = await PushToken.findOne({ userId, deviceId });
        if (existingPushToken){
            if (existingPushToken.token != token){
                existingPushToken.token = token;
                await existingPushToken.save();
            }

            return;
        }

        const pushToken = new PushToken();
        pushToken.userId = userId;
        pushToken.deviceId = deviceId;
        pushToken.token = token;
        pushToken.createdAt = new Date();
        await pushToken.save();
    }

    static async deletePushTokens(userId: string, deviceId: string) {
        await PushToken.deleteMany({ userId, deviceId });
    }

    static async deletePushToken(token: string) {
        await PushToken.deleteMany({ token });
    }

    static async sendPushToUser(userId: string, title: string, subtitle?: string, data?: PushNotificationMessage['data']){
        const firebaseManager = FirebaseManager.getInstance();

        const pushTokens = await PushToken.find({ userId: userId });
        
        for (const pushToken of pushTokens){
            const message: PushNotificationMessage = {
                token: pushToken.token,
                title: title,
                subtitle: subtitle || '',
                data: data,
            };

            await firebaseManager.sendMessage(message);
        }
    }

}