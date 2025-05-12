import { SystemNotificationsManager } from "./SytemNotificationsManager";

export class HealthManager {

    static telegramMessagesCount: number = 0;
    static async checkTelegramBotHealth() {
        if (this.telegramMessagesCount == 0){
            SystemNotificationsManager.sendSystemMessage('‼️ Health Check: Telegram bot has zero messages during the last minute');
        }
        else {
            console.log('HealthManager - Telegram bot is healthy, messages count:', this.telegramMessagesCount);
            SystemNotificationsManager.sendSystemMessage('✅ Health Check: Telegram bot is healthy, messages count: ' + this.telegramMessagesCount);
        }

        this.telegramMessagesCount = 0;
    }

}