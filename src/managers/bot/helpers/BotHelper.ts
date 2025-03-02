import { Context } from "grammy";
import { IUser } from "../../../entities/users/User";
import { LogManager } from "../../LogManager";
import { TgMessage } from "../BotManager";

export interface Message {
    text: string;
    markup?: any;
}

export class BotHelper {
    kCommand: string;
    private kReplyMessage: Message;

    constructor(command: string, startCommandReplyMessage: Message) {
        LogManager.log('BotHelper', 'constructor');
        this.kCommand = command;
        this.kReplyMessage = startCommandReplyMessage;
    }

    async messageReceived(message: TgMessage, ctx: Context) {
    };

    async commandReceived(ctx: Context, user: IUser) {
        ctx.reply(this.kReplyMessage.text, {reply_markup: this.kReplyMessage.markup});
    }

    getChatId(ctx: Context): number {
        const message = ctx.update.message as TgMessage;
        return message.chat.id;
    }
}