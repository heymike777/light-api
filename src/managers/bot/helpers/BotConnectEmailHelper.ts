import { Context } from "grammy";
import { LogManager } from "../../LogManager";
import { BotManager } from "../BotManager";
import { BotHelper, Message } from "./BotHelper";
import { IUser, TelegramWaitingType, User } from "../../../entities/users/User";
import { UserManager } from "../../UserManager";
import { AuthManager } from "../../AuthManager";
import { Helpers } from "../../../services/helpers/Helpers";
import { IAuth } from "../../../entities/Auth";
import { TgMessage } from "../BotTypes";

export class BotConnectEmailHelper extends BotHelper {

    constructor() {
        LogManager.log('BotConnectEmailHelper', 'constructor');

        const replyMessage: Message = {
            text: 'Send your email address to connect your account.'
        };

        super('connect_email', replyMessage);
    }

    async commandReceived(ctx: Context, user: IUser) {
        await UserManager.updateTelegramState(user.id, { waitingFor: TelegramWaitingType.EMAIL, helper: this.kCommand });
        await super.commandReceived(ctx, user);
    }


    async messageReceived(message: TgMessage, ctx: Context, user: IUser): Promise<boolean> {
        LogManager.log('BotConnectEmailHelper', 'messageReceived', message.text);

        super.messageReceived(message, ctx, user);

        if (user.telegramState?.waitingFor == TelegramWaitingType.EMAIL){
            const email = message.text.trim();

            const isValid = Helpers.isValidEmail(email);
            if (!isValid){
                await BotManager.reply(ctx, 'Invalid email address. Please, try again.');
                return true;
            }

            let authId: string;
            try {
                authId = await AuthManager.createAuth(email);
            }
            catch (e: any){
                await BotManager.reply(ctx, e.message);
                return true;
            }

            await BotManager.reply(ctx, `Please, send 6-digits verification code that we sent to your email (${email})`);
            await UserManager.updateTelegramState(user.id, { waitingFor: TelegramWaitingType.EMAIL_VERIFICATION_CODE, helper: this.kCommand, data: { authId } });
            return true;
        }
        else if (user.telegramState?.waitingFor == TelegramWaitingType.EMAIL_VERIFICATION_CODE){
            const code = message.text.trim();

            // validate verification code
            const authId = user.telegramState?.data.authId;
            if (!authId){
                await BotManager.reply(ctx, 'Can\'t find authentication stream. Please, connect email again.');
                return true;
            }

            let auth: IAuth | undefined;
            try {
                auth = await AuthManager.validate(authId, code);
            }
            catch (e: any){
                await BotManager.reply(ctx, e.message);
                return true;
            }

            const existingUser = await AuthManager.findUser(auth.email);
            if (!existingUser){    
                // if this email is new - just add email to user
                await User.updateOne({ _id: user.id }, { email: auth.email });
            }
            else {
                // check if this (telegram) user has ZERO wallet and ZERO transactions - just merge two users
                try {
                    await UserManager.mergeUsers(user.id, existingUser.id);
                }
                catch (e: any){
                    await BotManager.reply(ctx, `Another user already has this email connected. Please, connect another email or do /revoke_account of this user (it will remove all your transactions history, trader profiles, etc). After cleaning, you'll be able to connect this email.`);
                    return true;
                }
            }

            await UserManager.updateTelegramState(user.id, undefined);

            await BotManager.reply(ctx, `Email connected ✅`);
            return true;
        }

        return false;
    }

}