import axios from "axios";
import { LogManager } from "./LogManager";

export class SystemNotificationsManager {

    static async sendSystemMessage(text: string){
        text = `[${process.env.SERVER_NAME}] ${text}`
        await this.sendTextMessage(text);
    }

    private static async sendTextMessage(text: string){
        LogManager.log('SystemNotificationsManager', 'send:', text);
        try {
            const url = 'https://tg-bot-api.sololabs.io/api/v1/messages/system';
            const data = { message: text };
            const resp = await axios.post(url, data);    
        }
        catch (error){
            LogManager.log('BotManager', 'sendTextMessage', 'error:', error);   
        }
    }


}