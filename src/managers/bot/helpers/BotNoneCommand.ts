import { Context } from "grammy";
import { BotHelper, Message } from "./BotHelper";
import { IUser } from "../../../entities/users/User";

export class BotNoneHelper extends BotHelper {

    constructor() {
        const replyMessage: Message = { text: 'Do nothing' };
        super('none', replyMessage);
    }

    async commandReceived(ctx: Context, user: IUser) {
    }

}