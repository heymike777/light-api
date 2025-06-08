import { Context } from "grammy";
import { LogManager } from "../../LogManager";
import { BotHelper, Message } from "./BotHelper";
import { IUser } from "../../../entities/users/User";
import { InlineButton } from "../BotTypes";
import { BotManager } from "../BotManager";
import { UserManager } from "../../UserManager";
import { EventsManager } from "../../EventsManager";
import { SwapManager } from "../../SwapManager";
import { TraderProfilesManager } from "../../TraderProfilesManager";

export class BotEventsHelper extends BotHelper {

    constructor() {
        LogManager.log('BotEventsHelper', 'constructor');
        const replyMessage: Message = { text: 'Events' };
        super('events', replyMessage, ['event']);
    }

    async commandReceived(ctx: Context, user: IUser) {
        await UserManager.updateTelegramState(user.id, undefined);

        const buttonId = ctx.update?.callback_query?.data;
        const botUsername = BotManager.getBotUsername(ctx);

        if (ctx?.update?.message?.text == '/events' || ctx?.update?.message?.text == '/event' || buttonId == 'events' || buttonId == 'event'){
            const replyMessage = await this.buildEventMessage(user, botUsername);
            return await super.commandReceived(ctx, user, replyMessage);
        }
        else if (buttonId == 'events|refresh'){
            await this.refresh(ctx, user);
        } 
        // else if (buttonId && buttonId.startsWith('settings|set_chain|')){
        //     const parts = buttonId.split('|');
        //     if (parts.length >= 3){
        //         const chain = parts[2] as Chain;
        //         user.defaultChain = chain;
        //         await User.updateOne({ _id: user.id }, { $set: { defaultChain: chain } });
        //         await this.refresh(ctx, user);

        //         // send message to user about chain change
        //         const buttons: InlineButton[] = [];
        //         buttons.push({ id: 'tokens|hot', text: '🔥 Hot tokens' });
        //         buttons.push({ id: 'row', text: '' });
        //         if (chain != Chain.SOLANA){
        //             const link = ChainManager.getBridgeUrl(chain);
        //             if (link) { buttons.push({ id: 'bridge', text: '🌉 Bridge', link }); }
        //         }
        //         buttons.push({ id: 'settings', text: '⚙️ Settings' });

        //         const markup = BotManager.buildInlineKeyboard(buttons);
        //         const chainTitle = ChainManager.getChainTitle(chain);
        //         const message = `✅ Your chain switched to: ${chainTitle}\n\nYou can trade token on ${chainTitle} now. Just send me the token address or click "Hot tokens" to find trading tokens.`;
        //         await BotManager.reply(ctx, message, { reply_markup: markup });
        //     }
        // }
        // else if (buttonId && buttonId.startsWith('settings|')){
        //     const parts = buttonId.split('|');
        //     if (parts.length == 4){                
        //     }
        //     else {
        //         LogManager.error('Invalid buttonId:', buttonId);
        //     }
        // }
    }

    async refresh(ctx: Context, user: IUser) {
        const botUsername = BotManager.getBotUsername(ctx);

        const message = await this.buildEventMessage(user, botUsername);

        if (message.photo){
            await BotManager.editMessageWithPhoto(ctx, message.photo, message.text, message.markup);
        }
        else {
            await BotManager.editMessage(ctx, message.text, message.markup);
        }
    }

    async buildEventMessage(user: IUser, botUsername: string): Promise<Message> {
        const event = await EventsManager.getActiveEvent();

        if (!event) {
            return { text: '🚫 No trading events live right now.\n\n🚀 Stay tuned — new opportunities drop often!' };
        }

        let text = '';
        text += `<b>${event.title}</b>`;
        
        if (event.status == 'upcoming') {
            text += `\nStarts on ${EventsManager.formatDateToString(event.startAt)}`;
        }
        else if (event.status == 'active') {
            text += `\nStart: ${EventsManager.formatDateToString(event.startAt)}`;
            text += `\nEnd: ${EventsManager.formatDateToString(event.endAt)}`;
        }
        else if (event.status == 'completed') {
            text += `\nEnded on ${EventsManager.formatDateToString(event.endAt)}`;
        }
        text += `\n\n`;
        text += `${event.description}`;

        if (event.status == 'active') {
            text += `\n\n<b>Your points:</b>`;

            const traderProfiles = await TraderProfilesManager.getUserTraderProfiles(user.id, SwapManager.kNativeEngineId);
            for (const traderProfile of traderProfiles) {
                const points = await EventsManager.calculateEventPointsForTradingProfile(event, traderProfile);
                if (traderProfiles.length > 1){
                    text += `\n${traderProfile.title}: ${points}`;
                }
                else {
                    text += ` ${points}`;
                }
            }

        }
        //TODO: if event.chain is not user.defaultChain, add button to switch chain to event.chain
        //TODO: add button "BUY CHILL"

        let buttons: InlineButton[] = [];

        buttons.push({ id: `events|refresh`, text: '↻ Refresh' });

        const markup = BotManager.buildInlineKeyboard(buttons);
        return { 
            text, 
            markup, 
            photo: event.image, 
            buttons: buttons 
        };
    }

}