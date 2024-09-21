import { IUser, TelegramUser, User } from "../entities/User";

export class UserManager {

    static cachedUsers: {user: IUser, createdAt: Date}[] = [];

    static async getUserByTelegramUser(from: TelegramUser): Promise<IUser> {
        const cachedUser = this.cachedUsers.find(cachedUser => cachedUser.user.telegram?.id === from.id);
        if (cachedUser){
            return cachedUser.user;
        }

        const now = new Date();
        const user = await User.findOne({ 'telegram.id': from.id });
        if (user){
            this.cachedUsers.push({ user: user, createdAt: now });
            return user;
        }
        else {
            const newUser = await User.create({
                telegram: from,
                createdAt: now,
            });
            this.cachedUsers.push({ user: newUser, createdAt: now });
            return newUser;
        }
    }

    static async cleanOldCache(){
        const now = new Date();
        this.cachedUsers = this.cachedUsers.filter(cachedUser => now.getTime() - cachedUser.createdAt.getTime() < 1000 * 60 * 5);
    }

}