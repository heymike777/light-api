import { SystemNotificationsManager } from "./SytemNotificationsManager";

export class HealthManager {

    static telegramMessagesCount: number = 0;
    static telegramMessagesCountByUser: { [key: string]: number } = {};

    static async checkTelegramBotHealth() {
        if (this.telegramMessagesCount == 0){
            SystemNotificationsManager.sendSystemMessage('‼️ Health Check: Telegram bot has zero messages during the last minute');
        }
        else {
            console.log('HealthManager - Telegram bot is healthy, messages count:', this.telegramMessagesCount);

            const topUsers = Object.entries(this.telegramMessagesCountByUser).sort((a, b) => b[1] - a[1]).slice(0, 10);
            const topUsersText = topUsers.map(([userId, count]) => `User ${userId}: ${count} messages`).join('\n');

            SystemNotificationsManager.sendSystemMessage('✅ Health Check: Telegram bot is healthy, messages count: ' + this.telegramMessagesCount + '\n\nTop users:\n' + topUsersText);
        }

        this.telegramMessagesCount = 0;
        this.telegramMessagesCountByUser = {};
    }

}