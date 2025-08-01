import { Context } from "grammy";
import { LogManager } from "../../LogManager";
import { BotHelper, Message } from "./BotHelper";
import { IUser, TelegramWaitingType } from "../../../entities/users/User";
import { InlineButton, TgMessage } from "../BotTypes";
import { BotManager } from "../BotManager";
import { UserManager } from "../../UserManager";
import { EventsManager } from "../../EventsManager";
import { SwapManager } from "../../SwapManager";
import { TraderProfilesManager } from "../../TraderProfilesManager";
import { ChainManager } from "../../chains/ChainManager";
import { ITradingEvent, TradingEvent } from "../../../entities/events/TradingEvent";
import { Chain } from "../../../services/solana/types";
import { Helpers } from "../../../services/helpers/Helpers";
import { ExplorerManager } from "../../../services/explorers/ExplorerManager";
import { TradingEventSpecialPrizeSubmission } from "../../../entities/events/TradingEventSpecialPrizeSubmission";

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
        else if (buttonId && buttonId.startsWith('events|')){
            const parts = buttonId.split('|');
            if (parts.length >= 3){
                const type = parts[1];
                const eventId = parts[2];
                if (type == 'refresh'){
                    console.log('refresh event', eventId);
                    await this.refresh(ctx, user, eventId);
                }
                else if (type == 'leaderboard'){
                    if (parts.length == 4 && parts[3] == 'refresh'){
                        await this.refreshLeaderboard(ctx, user, eventId);
                    }
                    else {
                        const replyMessage = await this.buildLeaderboardMessage(user, eventId);
                        return await super.commandReceived(ctx, user, replyMessage);
                    }
                }
                else if (type == 'special'){
                    if (parts.length == 4 && parts[3] == 'submit'){
                        await UserManager.updateTelegramState(user.id, { waitingFor: TelegramWaitingType.EVENT_SPECIAL_PRIZE_INFO, data: { eventId: eventId }, helper: this.kCommand });
                        await BotManager.reply(ctx, `Enter url to your X thread:`);    
                    }
                    else {
                        const replyMessage = await this.buildSpecialPrizesMessage(user, eventId);
                        return await super.commandReceived(ctx, user, replyMessage);                    
                    }
                }
            }
        } 
    }

    async refresh(ctx: Context, user: IUser, eventId: string) {
        const botUsername = BotManager.getBotUsername(ctx);
        const message = await this.buildEventMessage(user, botUsername, eventId);

        if (message.photo){
            await BotManager.editMessageWithPhoto(ctx, message.photo, message.text, message.markup);
        }
        else {
            await BotManager.editMessage(ctx, message.text, message.markup);
        }
    }

    async refreshLeaderboard(ctx: Context, user: IUser, eventId: string) {
        const message = await this.buildLeaderboardMessage(user, eventId);

        if (message.photo){
            await BotManager.editMessageWithPhoto(ctx, message.photo, message.text, message.markup);
        }
        else {
            await BotManager.editMessage(ctx, message.text, message.markup);
        }
    }

    async buildEventMessage(user: IUser, botUsername: string, eventId?: string): Promise<Message> {
        let event: ITradingEvent | undefined = undefined;

        if (eventId){
            event = await EventsManager.getEventById(eventId);
        }

        if (!event){
            event = await EventsManager.getActiveEvent()
        }

        if (!event) {
            return { text: '🚫 No trading events live right now.\n\n🚀 Stay tuned — new opportunities drop often!' };
        }

        let text = '';
        text += `<b>${event.title}</b>`;
        
        if (event.status == 'upcoming') {
            try {
                const safeStartAt = EventsManager.safeDate(event.startAt);
                text += `\nStarts on ${safeStartAt ? EventsManager.formatDateToString(safeStartAt) : 'Invalid date'}`;
            } catch (error) {
                console.error('BotEventsHelper.formatDateToString error for startAt:', error);
                text += `\nStarts on Invalid date`;
            }
        }
        else if (event.status == 'active') {
            try {
                const safeStartAt = EventsManager.safeDate(event.startAt);
                const safeEndAt = EventsManager.safeDate(event.endAt);
                text += `\nStart: ${safeStartAt ? EventsManager.formatDateToString(safeStartAt) : 'Invalid date'}`;
                text += `\nEnd: ${safeEndAt ? EventsManager.formatDateToString(safeEndAt) : 'Invalid date'}`;
            } catch (error) {
                console.error('BotEventsHelper.formatDateToString error for active event:', error);
                text += `\nStart: Invalid date`;
                text += `\nEnd: Invalid date`;
            }
        }
        else if (event.status == 'completed') {
            try {
                const safeEndAt = EventsManager.safeDate(event.endAt);
                text += `\nEnded on ${safeEndAt ? EventsManager.formatDateToString(safeEndAt) : 'Invalid date'}`;
            } catch (error) {
                console.error('BotEventsHelper.formatDateToString error for endAt:', error);
                text += `\nEnded on Invalid date`;
            }
        }
        text += `\n\n`;
        text += `${event.description}`;

        if (event.status == 'active') {
            text += `\n\n<b>Your points:</b>`;

            const traderProfiles = await TraderProfilesManager.getUserTraderProfiles(user.id, SwapManager.kNativeEngineId);
            const points = await EventsManager.calculateEventPointsForTradingProfile(event, traderProfiles);
            for (const traderProfile of traderProfiles) {
                const eventPoints = points[traderProfile.id] || 0;

                if (traderProfiles.length > 1){
                    text += `\n${traderProfile.title}: ${eventPoints}`;
                }
                else {
                    text += ` ${eventPoints}`;
                }
            }
        }

        let buttons: InlineButton[] = [];
        buttons.push({ id: `events|refresh|${event.id}`, text: '↻ Refresh' });

        const userChain = user.defaultChain || Chain.SOLANA;
        if (event.chains && event.chains.includes(userChain)==false){
            for (const chain of event.chains){
                buttons.push({ id: 'row', text: '' });
                buttons.push({ id: `settings|set_chain|${chain}`, text: `🔗 Switch to ${ChainManager.getChainTitle(chain)}` });
            }
        }

        const eventTokens = event.tokens || [];
        let index = 0;
        for (const token of eventTokens) {
            if (index % 2 == 0){
                buttons.push({ id: 'row', text: '' });
            }

            buttons.push({ id: `tokens|${token.mint}`, text: `BUY ${token.symbol}` });
            index++;
        }

        buttons.push({ id: 'row', text: '' });
        buttons.push({ id: `events|leaderboard|${event.id}`, text: '🏆 Leaderboard', link: event.webUrl });

        if (event.special){
            buttons.push({ id: 'row', text: '' });
            buttons.push({ id: `events|special|${event.id}`, text: '🎁 Special prizes' });
        }

        const markup = BotManager.buildInlineKeyboard(buttons);
        return { 
            text, 
            markup, 
            photo: event.image, 
            buttons: buttons 
        };
    }

    async buildLeaderboardMessage(user: IUser, eventId: string): Promise<Message> {
        const event = await EventsManager.getEventById(eventId);

        if (!event) {
            return { text: '🚫 Event not found' };
        }

        const leaderboard = await EventsManager.getLeaderboardForEvent(eventId);

        let text = '';
        text += `<b>${event.title}</b>`;
        text += `\n`;

        const chain = (event.chains && event.chains.length > 0) ? event.chains[0] : Chain.SOLANA;

        let index = 0;
        for (const entry of leaderboard){
            const explorerUrl = ExplorerManager.getUrlToAddress(chain, entry.walletAddress);

            text += `\n${index + 1}. ${entry.points} - <a href="${explorerUrl}">${Helpers.prettyWallet(entry.walletAddress)}</a>`;
            //TODO: if that's your trader profile, add " (you)"
            if (entry.userId == user.id){
                text += ` (you)`;
            }
            index++;
        }

        text += `\n\n(updated every hour)`;

        // if (event.status == 'active') {
        //     text += `\n\n<b>Your points:</b>`;

        //     const traderProfiles = await TraderProfilesManager.getUserTraderProfiles(user.id, SwapManager.kNativeEngineId);
        //     for (const traderProfile of traderProfiles) {
        //         const points = await EventsManager.calculateEventPointsForTradingProfile(event, traderProfile);
        //         if (traderProfiles.length > 1){
        //             text += `\n${traderProfile.title}: ${points}`;
        //         }
        //         else {
        //             text += ` ${points}`;
        //         }
        //     }

        // }

        const buttons: InlineButton[] = [];
        buttons.push({ id: `events|leaderboard|${event.id}|refresh`, text: '↻ Refresh' });

        const markup = BotManager.buildInlineKeyboard(buttons);
        return { 
            text, 
            markup, 
            photo: event.image, 
            buttons: buttons 
        };
    }

    async buildSpecialPrizesMessage(user: IUser, eventId: string): Promise<Message> {
        const event = await EventsManager.getEventById(eventId);

        if (!event) {
            return { text: '🚫 Event not found' };
        }

        if (!event.special){
            return { text: '🚫 No special prizes for this event' };
        }

        let text = event.special.description;

        const buttons: InlineButton[] = [];
        buttons.push({ id: `events|special|${event.id}|submit`, text: '📦 Submit link to X thread' });

        const markup = BotManager.buildInlineKeyboard(buttons);
        return { 
            text, 
            markup, 
            photo: event.special.image, 
            buttons: buttons 
        };
    }

    async messageReceived(message: TgMessage, ctx: Context, user: IUser): Promise<boolean> {
        LogManager.log('BotEventsHelper', 'messageReceived', message.text);

        super.messageReceived(message, ctx, user);

        if (user.telegramState?.waitingFor == TelegramWaitingType.EVENT_SPECIAL_PRIZE_INFO){
            const info = message.text.trim();
            const eventId = user.telegramState?.data.eventId;

            const submission = new TradingEventSpecialPrizeSubmission();
            submission.eventId = eventId;
            submission.userId = user.id;
            submission.info = info;
            submission.createdAt = new Date();
            await submission.save();

            await UserManager.updateTelegramState(user.id, undefined);
            await BotManager.reply(ctx, `Submitted ✅\n\nWe will announce the winners after the event.\n\nBTW, you can submit multiple submissions 😉`);
            return true;
        }

        return false;
    }

}