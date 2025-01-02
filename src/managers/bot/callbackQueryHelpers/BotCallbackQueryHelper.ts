import { IUser } from "../../../entities/users/User";
import { Chain } from "../../../services/solana/types";
import { LogManager } from "../../LogManager";
import { TgMessage } from "../BotManager";

export interface Message {
    text: string;
}

export class BotCallbackQueryHelper {
    kChain: Chain;
    kCommand: string;
    private kStartCommandReplyMessage: Message;

    constructor(chain: Chain, command: string, startCommandReplyMessage: Message) {
        LogManager.log('BotHelper', 'constructor');
        this.kChain = chain;
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