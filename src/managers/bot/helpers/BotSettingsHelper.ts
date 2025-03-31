import { Context } from "grammy";
import { LogManager } from "../../LogManager";
import { BotHelper, Message } from "./BotHelper";
import { IUser, User } from "../../../entities/users/User";
import { BotKeyboardMarkup, InlineButton } from "../BotTypes";
import { Chain } from "../../../services/solana/types";
import { BotManager } from "../BotManager";
import { UserManager } from "../../UserManager";

export class BotSettingsHelper extends BotHelper {

    constructor() {
        LogManager.log('BotSettingsHelper', 'constructor');
        const replyMessage: Message = { text: '⚙️ Settings are coming soon' };
        super('settings', replyMessage);
    }

    async commandReceived(ctx: Context, user: IUser) {
        await UserManager.updateTelegramState(user.id, undefined);

        const buttonId = ctx.update?.callback_query?.data;
        const botUsername = BotManager.getBotUsername(ctx);

        if (ctx?.update?.message?.text == '/settings' || buttonId == 'settings'){
            const replyMessage = await this.buildSettingsMessage(user, botUsername);
            return await super.commandReceived(ctx, user, replyMessage);
        }
        else if (buttonId == 'settings|refresh'){
            await this.refresh(ctx, user);
        } 
        else if (buttonId && buttonId.startsWith('settings|set_chain|')){
            const parts = buttonId.split('|');
            if (parts.length >= 3){
                const chain = parts[2] as Chain;
                user.defaultChain = chain;
                await User.updateOne({ _id: user.id }, { $set: { defaultChain: chain } });
                await this.refresh(ctx, user);
            }
        }
        else if (buttonId && buttonId.startsWith('settings|')){
            const parts = buttonId.split('|');
            if (parts.length == 4){                
            }
            else {
                console.error('Invalid buttonId:', buttonId);
            }
        }
    }

    async refresh(ctx: Context, user: IUser) {
        const botUsername = BotManager.getBotUsername(ctx);

        const message = await this.buildSettingsMessage(user, botUsername);
        await BotManager.editMessage(ctx, message.text, message.markup);
    }

    async buildSettingsMessage(user: IUser, botUsername: string): Promise<Message> {
        let text = `⚙️ Settings`;
        text += `\n\n`;
        text += `You can configure your default chain, priority fee, slippage, etc.`;
        let buttons: InlineButton[] = [];

        buttons.push({ id: `settings|refresh`, text: '↻ Refresh' });
        buttons.push({ id: `delete_message`, text: '✕ Close' });
        buttons.push({ id: 'row', text: '' });

        buttons.push({ id: `none`, text: '-- Chain --' });
        buttons.push({ id: 'row', text: '' });
        const chains = [
            { id: Chain.SOLANA, title: 'Solana' },
            { id: Chain.SONIC, title: 'Sonic SVM' },
        ];

        for (const item of chains) {
            const isSelected = user.defaultChain == item.id || (!user.defaultChain && item.id == Chain.SOLANA);
            const prefix = isSelected ? '🟢 ' : '';
            buttons.push({ id: `settings|set_chain|${item.id}`, text: prefix + item.title });
        }
        buttons.push({ id: 'row', text: '' });

        const markup = BotManager.buildInlineKeyboard(buttons);
        return { text, markup };
    }

}