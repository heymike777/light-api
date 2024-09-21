import { IUser } from "../../../entities/User";
import { TgMessage } from "../BotManager";

export interface Message {
    text: string;
}

export class BotHelper {
    kCommand: string;
    private kStartCommandReplyMessage: Message;

    constructor(command: string, startCommandReplyMessage: Message) {
        console.log('BotHelper', 'constructor');
        this.kCommand = command;
        this.kStartCommandReplyMessage = startCommandReplyMessage;
    }

    async messageReceived(message: TgMessage, ctx: any) {
    };

    async commandReceived(ctx: any, user: IUser) {
        ctx.reply(this.kStartCommandReplyMessage.text);
    }

    getChatId(ctx: any): number {
        const message = ctx.update.message as TgMessage;
        return message.chat.id;
    }
}