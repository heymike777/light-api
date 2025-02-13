import { IUser } from "../entities/users/User";
import { SystemNotificationsManager } from "./SytemNotificationsManager";

export class GiftCardsManager {

        static async sendSystemNotification(user: IUser | undefined, giftCard: string){
            const username = user?.email || user?.telegram?.username || `user_${user?.id || 'unknown'}`;
            const message = `${username} just claimed ${giftCard} gift card`;
            SystemNotificationsManager.sendSystemMessage(message);
        }

}