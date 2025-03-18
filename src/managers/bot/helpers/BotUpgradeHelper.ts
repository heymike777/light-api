import { Context } from "grammy";
import { LogManager } from "../../LogManager";
import { BotHelper, Message } from "./BotHelper";
import { IUser } from "../../../entities/users/User";

export class BotUpgradeHelper extends BotHelper {

    constructor() {
        LogManager.log('BotUpgradeHelper', 'constructor');
        const replyMessage: Message = { text: '👑 Premium subscriptions are coming soon' };
        super('upgrade', replyMessage);
    }

    async commandReceived(ctx: Context, user: IUser) {
        await super.commandReceived(ctx, user);
    }

}