import { Context } from "grammy";
import { LogManager } from "../../LogManager";
import { BotHelper, Message } from "./BotHelper";
import { IUser } from "../../../entities/users/User";

export class BotSettingsHelper extends BotHelper {

    constructor() {
        LogManager.log('BotSettingsHelper', 'constructor');
        const replyMessage: Message = { text: '⚙️ Settings are coming soon' };
        super('settings', replyMessage);
    }

    async commandReceived(ctx: Context, user: IUser) {
        await super.commandReceived(ctx, user);
    }

}