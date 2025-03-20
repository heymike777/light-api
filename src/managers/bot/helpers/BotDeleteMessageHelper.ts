import { Context } from "grammy";
import { LogManager } from "../../LogManager";
import { BotManager } from "../BotManager";
import { BotHelper, Message } from "./BotHelper";
import { IUser } from "../../../entities/users/User";

export class BotDeleteMessageHelper extends BotHelper {

    constructor() {
        LogManager.log('BotDeleteMessageHelper', 'constructor');
        const replyMessage: Message = {text: ''};
        super('delete_message', replyMessage);
    }

    async commandReceived(ctx: Context, user: IUser) {
        await BotManager.deleteMessage(ctx);
    }

}