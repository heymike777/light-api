import { Context } from "grammy";
import { IUser } from "../../../entities/users/User";
import { LogManager } from "../../LogManager";
import { BotManager, InlineButton, TgMessage } from "../BotManager";

export interface Message {
    text: string;
    markup?: any;
    photo?: string,
    buttons?: InlineButton[],
}

export class BotHelper {
    kCommand: string;
    kAdditionalCommands?: string[];
    private kReplyMessage: Message;

    constructor(command: string, replyMessage: Message, additionalCommands?: string[]) {
        LogManager.log('BotHelper', 'constructor');
        this.kCommand = command;
        this.kReplyMessage = replyMessage;
        this.kAdditionalCommands = additionalCommands;
    }

    async messageReceived(message: TgMessage, ctx: Context, user: IUser): Promise<boolean> {
        return false;
    };

    async commandReceived(ctx: Context, user: IUser) {
        if (this.kReplyMessage.photo) {
            await ctx.replyWithPhoto(this.kReplyMessage.photo, { 
                caption: this.kReplyMessage.text, 
                reply_markup: this.kReplyMessage.markup,
                parse_mode: 'HTML',
            });
        }
        else {
            await BotManager.reply(ctx, this.kReplyMessage.text, { 
                reply_markup: this.kReplyMessage.markup, 
                parse_mode: 'HTML',
            });
        }
    }

    getReplyMessage(): Message {
        return this.kReplyMessage;
    }

    setReplyMessage(message: Message) {
        this.kReplyMessage = message;
    }

    // getChatId(ctx: Context): number {
    //     const message = ctx.update.message as TgMessage;
    //     return message.chat.id;
    // }
}