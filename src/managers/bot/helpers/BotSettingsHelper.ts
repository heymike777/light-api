import { Context } from "grammy";
import { LogManager } from "../../LogManager";
import { BotHelper, Message } from "./BotHelper";
import { IUser } from "../../../entities/users/User";
import { BotKeyboardMarkup, InlineButton } from "../BotTypes";
import { Chain } from "../../../services/solana/types";
import { BotManager } from "../BotManager";

export class BotSettingsHelper extends BotHelper {

    constructor() {
        LogManager.log('BotSettingsHelper', 'constructor');
        const replyMessage: Message = { text: '⚙️ Settings are coming soon' };
        super('settings', replyMessage);
    }

    async commandReceived(ctx: Context, user: IUser) {
        const botUsername = BotManager.getBotUsername(ctx);
        const replyMessage = await this.buildSettingsMessage(user, botUsername);
        await super.commandReceived(ctx, user, replyMessage);
    }

    async buildSettingsMessage(user: IUser, botUsername: string): Promise<Message> {
        const chain = Chain.SOLANA; //TODO: fetch portfolio for other chains

        let text = `⚙️ Settings are coming soon`;
        let buttons: InlineButton[] = [];


        // buttons.push({ id: `none`, text: '-- Chain --' });

        const markup = BotManager.buildInlineKeyboard(buttons);
        return { text, markup };
    }

}