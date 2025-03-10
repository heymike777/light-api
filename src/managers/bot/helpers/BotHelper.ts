import { Context } from "grammy";
import { IUser } from "../../../entities/users/User";
import { LogManager } from "../../LogManager";
import { BotManager } from "../BotManager";
import { BotKeyboardMarkup, InlineButton, TgMessage } from "../BotTypes";

export interface Message {
    text: string;
    markup?: BotKeyboardMarkup;
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
            await BotManager.replyWithPhoto(ctx, replyMessage.photo, replyMessage.text, replyMessage.markup);
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