import { Context } from "grammy";
import { LogManager } from "../../LogManager";
import { BotHelper, Message } from "./BotHelper";
import { IUser, User } from "../../../entities/users/User";
import { UserManager } from "../../UserManager";
import { BotManager } from "../BotManager";
import { InlineButton, TgMessage } from "../BotTypes";
import { ConfigManager } from "../../ConfigManager";
import { StatusType, Swap } from "../../../entities/payments/Swap";
import { ChainManager } from "../../chains/ChainManager";
import { Chain } from "../../../services/solana/types";
import { EventsManager } from "../../EventsManager";
import { Helpers } from "../../../services/helpers/Helpers";
import { UserTraderProfile } from "../../../entities/users/TraderProfile";

export class BotAdminHelper extends BotHelper {

    constructor() {
        LogManager.log('BotAdminHelper', 'constructor');
        const replyMessage: Message = { text: 'Admin config' };
        super('admin', replyMessage);
    }

    async commandReceived(ctx: Context, user: IUser) {
        if (!user.isAdmin){
            return;
        }

        await UserManager.updateTelegramState(user.id, undefined);

        let buttonId = ctx.update?.callback_query?.data;
        const botUsername = BotManager.getBotUsername(ctx);

        if (ctx?.update?.message?.text == '/admin' || buttonId == 'admin'){
            const { message, buttons } = await this.buildAdminMessage(user);
            const markup = BotManager.buildInlineKeyboard(buttons);
            await BotManager.reply(ctx, message, {
                reply_markup: markup,
                parse_mode: 'HTML',
            });
        }
        else if (buttonId && buttonId == 'admin|refresh'){
            const { message, buttons } = await this.buildAdminMessage(user, ctx);
            const markup = BotManager.buildInlineKeyboard(buttons);
            await BotManager.editMessage(ctx, message, markup);
        }
        else if (buttonId?.startsWith('admin|ref_payouts|')){
            const isEnabled = buttonId.split('|')[2] == 'true';
            await ConfigManager.updateConfig({ isRefPayoutsEnabled: isEnabled });

            const { message, buttons } = await this.buildAdminMessage(user, ctx);
            const markup = BotManager.buildInlineKeyboard(buttons);
            await BotManager.editMessage(ctx, message, markup);
        }
        else if (buttonId && buttonId == 'admin|create_event'){
            await BotManager.reply(ctx, 'No event to create');

            // await EventsManager.createSonicSummerSurgeEvent();
            // await BotManager.reply(ctx, 'Event created ✅');

            // const { message, buttons } = await this.buildAdminMessage(user, ctx);
            // const markup = BotManager.buildInlineKeyboard(buttons);
            // await BotManager.editMessage(ctx, message, markup);
        }
        else if (buttonId && buttonId == 'admin|event|leaderboard|chill'){
            await BotManager.reply(ctx, 'CHILL LEADERBOARD');
        }
        else if (buttonId && buttonId == 'admin|event|leaderboard|chaos'){
            await BotManager.reply(ctx, 'CHAOS LEADERBOARD');
        }
        else if (buttonId && buttonId == 'admin|event|leaderboard|fomo'){
            await BotManager.reply(ctx, 'FOMO LEADERBOARD');
        }
        else if (buttonId && buttonId == 'admin|event|leaderboard|sonic'){
            await this.replyWithSonicLeaderboard(ctx, user);
        }
        else {
            await super.commandReceived(ctx, user);
        }
    }

    async replyWithSonicLeaderboard(ctx: Context, user: IUser){
        console.log('replyWithSonicLeaderboard');
        const event = await EventsManager.getActiveEvent();
        if (!event){
            await BotManager.reply(ctx, 'No active event');
            return;
        }
        const eventId = '' + event._id;
        const eventLeaderboard = await EventsManager.getLeaderboardForEvent(eventId);
        const traderProfilesIds = eventLeaderboard.map(entry => entry.traderProfileId);
        console.log('traderProfilesIds:', traderProfilesIds);
        const traderProfiles = await UserTraderProfile.find({ _id: { $in: traderProfilesIds } });
        const usersIds = traderProfiles.map(tp => tp.userId);
        console.log('usersIds:', usersIds);
        const users = await User.find({ _id: { $in: usersIds } });
        const leaderboard: { walletAddress: string, points: number, prize?: string, user?: IUser }[] = [];
        
        let index = 0;
        for (const entry of eventLeaderboard){
            const prize = event?.prizes?.[index] || undefined;
            const traderProfile = traderProfiles.find(tp => tp.userId == entry.traderProfileId);
            const user = users.find(u => u.id == traderProfile?.userId);
            leaderboard.push({ 
                walletAddress: Helpers.prettyWallet(entry.walletAddress), 
                points: entry.points, 
                prize,
                user,
            });
            index++;
        }

        let message = `🔹 Sonic leaderboard\n\n`;
        for (const entry of leaderboard){
            message += `${entry.walletAddress} (${entry.user?.telegram?.username || entry.user?.id || 'N/A'}) - points: ${entry.points} prize: ${entry.prize}\n`;
        }

        await BotManager.reply(ctx, message);
    }

    async messageReceived(message: TgMessage, ctx: Context, user: IUser): Promise<boolean> {
        if (!user.isAdmin){
            return false;
        }

        LogManager.log('BotAdminHelper', 'messageReceived', message.text);

        super.messageReceived(message, ctx, user);

        // if (user.telegramState?.waitingFor == TelegramWaitingType.ADD_REFCODE){
        //     const refcode = message.text.trim();

        //     const isValid = await ReferralsManager.isValidReferralCode(refcode);
        //     if (!isValid){
        //         await BotManager.reply(ctx, 'Invalid refcode. Please, try again.');
        //         return true;
        //     }

        //     await ReferralsManager.saveReferralCode(user, refcode);

        //     await BotManager.reply(ctx, `<code>${refcode}</code> refcode added ✅`);
        //     await UserManager.updateTelegramState(user.id, undefined);

        //     return true;
        // }

        return false;
    }

    async buildAdminMessage(user: IUser, ctx?: Context): Promise<{ message: string, buttons: InlineButton[] }> {
        const config = await ConfigManager.getConfig();

        let message = `🤖 Admin config\n`;

        const volumesByChain = await Swap.aggregate([
            {
                $match: { "status.type": StatusType.COMPLETED }
            },
            { 
                $group: { _id: '$chain', totalVolume: { $sum: '$value.usd' } } 
            }
        ]);
        const chainsOrder = [Chain.SOLANA, Chain.SONIC, Chain.SOON_MAINNET, Chain.SVMBNB_MAINNET, Chain.SOONBASE_MAINNET];
        for (const chain of chainsOrder){
            const volume = volumesByChain.find(v => v._id === chain);
            if (volume){
                message += `\n${ChainManager.getChainTitle(volume._id)}: $${volume.totalVolume.toFixed(2)}`;
            }
        }

        message += `\n\nRef payouts: ${config?.isRefPayoutsEnabled ? '🟢' : '🔴'}`;

        const buttons: InlineButton[] = [];
        buttons.push({ id: `admin|refresh`, text: '↻ Refresh' });
        buttons.push({ id: `delete_message`, text: '✕ Close' });
        buttons.push({ id: `row`, text: '' });
        if (config?.isRefPayoutsEnabled){
            buttons.push({ id: `admin|ref_payouts|false`, text: `🟢 Ref payouts` });
        }
        else{
            buttons.push({ id: `admin|ref_payouts|true`, text: `🔴 Ref payouts` });
        }
        buttons.push({ id: `row`, text: '' });
        buttons.push({ id: `admin|create_event`, text: '➕ Create event' });
        buttons.push({ id: `row`, text: '' });
        buttons.push({ id: `admin|event|leaderboard|chill`, text: '🦔 Chill' });
        buttons.push({ id: `admin|event|leaderboard|chaos`, text: '🪽 Chaos' });
        buttons.push({ id: `row`, text: '' });
        buttons.push({ id: `admin|event|leaderboard|fomo`, text: '🎮 Fomo' });
        buttons.push({ id: `admin|event|leaderboard|sonic`, text: '🔹 Sonic' });

        return { message, buttons };
    }

}