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

    async commandReceived(ctx: Context, user: IUser, replyMsg?: Message) {
        const replyMessage = replyMsg || this.kReplyMessage;
        if (replyMessage.photo) {
            await ctx.replyWithPhoto(replyMessage.photo, { 
                caption: replyMessage.text, 
                reply_markup: replyMessage.markup,
                parse_mode: 'HTML',
            });
        }
        else {
            await BotManager.reply(ctx, replyMessage.text, { 
                reply_markup: replyMessage.markup, 
                parse_mode: 'HTML',
            });
        }
    }

    getReplyMessage(): Message {
        return {
            text: this.kReplyMessage.text,
            markup: this.kReplyMessage.markup,
            photo: this.kReplyMessage.photo,
            buttons: this.kReplyMessage.buttons ? [...this.kReplyMessage.buttons] : undefined,
        };
    }

}