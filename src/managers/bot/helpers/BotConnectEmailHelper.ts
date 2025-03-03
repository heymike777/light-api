import { Context } from "grammy";
import { LogManager } from "../../LogManager";
import { TgMessage } from "../BotManager";
import { BotHelper, Message } from "./BotHelper";
import { IUser, TelegramWaitingType } from "../../../entities/users/User";
import { UserManager } from "../../UserManager";

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

            //TODO: validate email
            //TODO: send verification code to email

            ctx.reply(`Please, send 6-digits verification code that we sent to your email (${email})`);
            await UserManager.updateTelegramState(user.id, { waitingFor: TelegramWaitingType.EMAIL_VERIFICATION_CODE, helper: this.kCommand });
            return true;
        }
        else if (user.telegramState?.waitingFor == TelegramWaitingType.EMAIL_VERIFICATION_CODE){
            const code = message.text.trim();

            //TODO: validate verification code

            ctx.reply(`Received verification code: ${code}`);
            return true;
        }

        return false;
    }

}