import axios from "axios";

export class SystemNotificationsManager {

    static async sendSystemMessage(text: string){
        text = `[${process.env.SERVER_NAME}] ${text}`
        await this.sendTextMessage(text);
    }

    private static async sendTextMessage(text: string){
        try {
            const url = 'https://tg-bot-api.sololabs.io/api/v1/messages/system';
            const data = { message: text };
            const resp = await axios.post(url, data);    
        }
        catch (error){
            console.log(new Date(), 'BotManager', 'sendTextMessage', 'error:', error);   
        }
    }


}