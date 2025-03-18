import { Context } from "grammy";
import { LogManager } from "../../LogManager";
import { BotHelper, Message } from "./BotHelper";
import { IUser } from "../../../entities/users/User";

export class BotHelpHelper extends BotHelper {

    constructor() {
        LogManager.log('BotHelpHelper', 'constructor');
        const replyMessage: Message = { text: '❓ We will write FAQ soon. For now just read what we have in /start message' };
        super('help', replyMessage);
    }

    async commandReceived(ctx: Context, user: IUser) {
        await super.commandReceived(ctx, user);
    }

}