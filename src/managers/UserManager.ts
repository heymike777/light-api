import { IUser, TelegramUser, User } from "../entities/User";
import { SystemNotificationsManager } from "./SytemNotificationsManager";

export class UserManager {

    static cachedUsers: {user: IUser, createdAt: Date}[] = [];

    static async getUserById(id: string): Promise<IUser> {
        const cachedUser = this.cachedUsers.find(cachedUser => cachedUser.user.id == id);
        if (cachedUser){
            return cachedUser.user;
        }

        const now = new Date();
        const user = await User.findById(id);
        if (user){
            this.cachedUsers.push({ user: user, createdAt: now });
            return user;
        }
        else {
            throw new Error('User not found');
        }
    }

    static async getUserByTelegramUser(from: TelegramUser): Promise<IUser> {
        const cachedUser = this.cachedUsers.find(cachedUser => cachedUser.user.telegram?.id === from.id);
        if (cachedUser){
            return cachedUser.user;
        }

        const now = new Date();
        const user = await User.findOne({ 'telegram.id': from.id });
        if (user){
            if (user.telegram?.is_bot !== from.is_bot || user.telegram?.first_name !== from.first_name || user.telegram?.last_name !== from.last_name || user.telegram?.username !== from.username || user.telegram?.language_code !== from.language_code){
                user.telegram = from;

                await User.updateOne({ _id: user._id }, {
                    $set: {
                        telegram: from,
                    }
                });
            }

            this.cachedUsers.push({ user: user, createdAt: now });
            return user;
        }
        else {
            const newUser = await User.create({
                telegram: from,
                createdAt: now,
            });

            SystemNotificationsManager.sendSystemMessage(`New user: @${from.username}`);

            this.cachedUsers.push({ user: newUser, createdAt: now });
            return newUser;
        }
    }

    static async getUserByEmail(email: string): Promise<IUser> {
        const cachedUser = this.cachedUsers.find(cachedUser => cachedUser.user.email === email);
        if (cachedUser){
            return cachedUser.user;
        }

        const now = new Date();
        const user = await User.findOne({ 'email': email });
        if (user){
            this.cachedUsers.push({ user: user, createdAt: now });
            return user;
        }
        else {
            const newUser = await User.create({
                email: email,
                createdAt: now,
            });
            
            SystemNotificationsManager.sendSystemMessage(`New user: ${email}`);

            this.cachedUsers.push({ user: newUser, createdAt: now });
            return newUser;
        }
    }

    static async cleanOldCache(){
        const now = new Date();
        this.cachedUsers = this.cachedUsers.filter(cachedUser => now.getTime() - cachedUser.createdAt.getTime() < 1000 * 60 * 5);
    }

}