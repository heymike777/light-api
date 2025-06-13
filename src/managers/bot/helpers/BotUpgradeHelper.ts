import { Context } from "grammy";
import { LogManager } from "../../LogManager";
import { BotHelper, Message } from "./BotHelper";
import { IUser } from "../../../entities/users/User";

export class BotUpgradeHelper extends BotHelper {

    constructor() {
        LogManager.log('BotUpgradeHelper', 'constructor');
        const replyMessage: Message = { text: '👑 Premium subscriptions \n\nWe process premium subscriptions manually for now. Please DM @heymike777 and he will help you.\n\n❤️' };
        super('upgrade', replyMessage);
    }

    async commandReceived(ctx: Context, user: IUser) {
        await super.commandReceived(ctx, user);
    }

}