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
import { Chain, Status } from "../../../services/solana/types";
import { EventsManager } from "../../EventsManager";
import { Helpers } from "../../../services/helpers/Helpers";
import { UserTraderProfile } from "../../../entities/users/TraderProfile";
import { kChillAddress, kSonicAddress } from "../../../services/solana/Constants";
import { ChaosStakeTx, IChaosStakeTx } from "../../../entities/staking/ChaosStakeTx";
import { ChaosManager } from "../../../services/solana/svm/ChaosManager";
import { TokenPriceManager } from "../../TokenPriceManager";

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
            await this.replyWithChillLeaderboard(ctx, user);
        }
        else if (buttonId && buttonId == 'admin|event|leaderboard|chaos'){
            await this.replyWithChaosLeaderboard(ctx, user);
        }
        else if (buttonId && buttonId == 'admin|event|leaderboard|fomo'){
            await this.replyWithFomoLeaderboard(ctx, user);
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
        const eventLeaderboard = await EventsManager.getLeaderboardForEvent(eventId, 100);
        const traderProfilesIds = eventLeaderboard.map(entry => entry.traderProfileId);
        const traderProfiles = await UserTraderProfile.find({ _id: { $in: traderProfilesIds } });
        const usersIds = traderProfiles.map(tp => tp.userId);
        const users = await User.find({ _id: { $in: usersIds } });
        const leaderboard: { walletAddress: string, points: number, prize?: string, user?: IUser }[] = [];
        
        let index = 0;
        for (const entry of eventLeaderboard){
            const prize = event?.prizes?.[index] || undefined;
            const traderProfile = traderProfiles.find(tp => tp._id == entry.traderProfileId);
            const user = users.find(u => u._id == traderProfile?.userId);
            leaderboard.push({ 
                walletAddress: Helpers.prettyWallet(entry.walletAddress), 
                points: entry.points, 
                prize,
                user,
            });
            index++;
        }

        let message = `🔹 Sonic leaderboard\n\n`;
        let index2 = 1;
        for (const entry of leaderboard){
            const username = entry.user?.telegram?.username ? `@${entry.user?.telegram?.username}` : entry.walletAddress;
            message += `${index2}. ${username} (${entry.walletAddress}) - vol: $${entry.points/100} 🎁 ${entry.prize}\n`;
            index2++;
        }

        await BotManager.reply(ctx, message);
    }

    async replyWithChillLeaderboard(ctx: Context, user: IUser){
        console.log('replyWithChillLeaderboard');
        const event = await EventsManager.getActiveEvent();
        if (!event){
            await BotManager.reply(ctx, 'No active event');
            return;
        }

        const pipeline = [
            {
                $match: {
                    'status.type': StatusType.COMPLETED,
                    points: { $exists: true },
                    createdAt: { $gte: event.startAt, $lte: event.endAt },
                    $or: [
                        { 'mint': kChillAddress },
                        { 'from.mint': kChillAddress },
                        { 'to.mint': kChillAddress }
                    ]
                }
            },
            {
                $project: {
                    traderProfileId: 1,
                    userId: 1,
                    eventPoints: {
                        $ifNull: [
                            { $toDouble: { $getField: { field: event.id, input: '$points' } } },
                            0
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: '$traderProfileId',
                    userId: { $first: '$userId' },
                    totalPoints: { $sum: '$eventPoints' }
                }
            },
            {
                $sort: { totalPoints: -1 as const }
            }
        ];

        const results = await Swap.aggregate(pipeline);
        const totalVolume = results.reduce((acc, entry) => acc + entry.totalPoints, 0);
        console.log('CHILL results:', results);

        let message = `🦔 Chill leaderboard\n\n`;
        message += `Total volume: $${Helpers.round(totalVolume/100, 2)}\n\n`;
        message += `---\n`;
        let index2 = 1;
        for (const entry of results){
            const traderProfile = await UserTraderProfile.findById(entry._id);
            const user = await User.findById(traderProfile?.userId);
            const walletAddress = traderProfile?.encryptedWallet?.publicKey ? Helpers.prettyWallet(traderProfile?.encryptedWallet?.publicKey) : 'unknown';

            const username = user?.telegram?.username ? `@${user?.telegram?.username}` : walletAddress;
            const gift = index2 <= 10 ? '🎁' : '';
            message += `${index2}. ${username} (${walletAddress}) - vol: $${entry.totalPoints/100} ${gift}\n`;
            index2++;

            if (index2 == 30){
                break;
            }
        }

        await BotManager.reply(ctx, message);
    }

    async replyWithChaosLeaderboard(ctx: Context, user: IUser){
        console.log('replyWithChaosLeaderboard');
        const event = await EventsManager.getActiveEvent();
        if (!event){
            await BotManager.reply(ctx, 'No active event');
            return;
        }
        const eventId = '' + event._id;

        await ChaosManager.checkPendingStakes();

        const stakeTxs = await ChaosStakeTx.find({ status: Status.COMPLETED, createdAt: { $gte: event.startAt, $lte: event.endAt } });
        console.log('CHAOS txs:', stakeTxs.length);

        const userStakes: { [key: string]: { [key: string]: number } } = {};
        for (const tx of stakeTxs){
            if (!userStakes[tx.walletAddress]){
                userStakes[tx.walletAddress] = {};
            }
            userStakes[tx.walletAddress][tx.mint] = (userStakes[tx.walletAddress][tx.mint] || 0) + tx.amount;
        }

        const prices = await TokenPriceManager.getTokensPrices(Chain.SONIC, [kChillAddress, kSonicAddress]);
        const chillPrice = prices.find(p => p.address == kChillAddress)?.price;
        const sonicPrice = prices.find(p => p.address == kSonicAddress)?.price;
        if (!chillPrice || !sonicPrice){
            await BotManager.reply(ctx, 'No token prices found. Please, try again later.');
            return;
        }

        for (const walletAddress in userStakes){
            userStakes[walletAddress]['usd'] = (userStakes[walletAddress][kChillAddress] || 0) * chillPrice + (userStakes[walletAddress][kSonicAddress] || 0) * sonicPrice;
        }

        const userStakesSorted = Object.entries(userStakes).sort((a, b) => b[1]['usd'] - a[1]['usd']);

        console.log('CHAOS stakeTxsByUser:', userStakes);

        let message = `🪽 Chaos leaderboard\n\n`;

        let index2 = 1;
        for (const entry of userStakesSorted){
            const walletAddress = entry[0];
            const traderProfile = await UserTraderProfile.findOne({ "encryptedWallet.publicKey": walletAddress });
            const user = await User.findById(traderProfile?.userId);
            const username = user?.telegram?.username ? `@${user?.telegram?.username}` : Helpers.prettyWallet(walletAddress);
            const usdString = Helpers.round(entry[1]['usd'], 2);
            const chillString = entry[1][kChillAddress] ? Helpers.round(entry[1][kChillAddress], 2) : '0';
            const sonicString = entry[1][kSonicAddress] ? Helpers.round(entry[1][kSonicAddress], 2) : '0';
            message += `${index2}. ${username} (${walletAddress}) - stake: $${usdString} (${chillString} CHILL, ${sonicString} SONIC)\n`;
            message += `---\n`;
            index2++;
        }

        await BotManager.reply(ctx, message);
    }

    async replyWithFomoLeaderboard(ctx: Context, user: IUser){
        console.log('replyWithChillLeaderboard');
        const event = await EventsManager.getActiveEvent();
        if (!event){
            await BotManager.reply(ctx, 'No active event');
            return;
        }
        const eventId = '' + event._id;

        const pipeline = [
            {
                $match: {
                    'status.type': StatusType.COMPLETED,
                    points: { $exists: true },
                    createdAt: { $gte: event.startAt, $lte: event.endAt },
                    $or: [
                        { 'mint': kChillAddress },
                        { 'from.mint': kChillAddress },
                        { 'to.mint': kChillAddress }
                    ]
                }
            },
            {
                $project: {
                    traderProfileId: 1,
                    userId: 1,
                    eventPoints: {
                        $ifNull: [
                            { $toDouble: { $getField: { field: event.id, input: '$points' } } },
                            0
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: '$traderProfileId',
                    userId: { $first: '$userId' },
                    totalPoints: { $sum: '$eventPoints' }
                }
            },
            {
                $sort: { totalPoints: -1 as const }
            }
        ];

        const results = await Swap.aggregate(pipeline);
        console.log('CHILL results:', results);

        let message = `🦔 Chill leaderboard\n\n`;
        let index2 = 1;
        for (const entry of results){
            const traderProfile = await UserTraderProfile.findById(entry._id);
            const user = await User.findById(traderProfile?.userId);
            const walletAddress = traderProfile?.encryptedWallet?.publicKey ? Helpers.prettyWallet(traderProfile?.encryptedWallet?.publicKey) : 'unknown';

            const username = user?.telegram?.username ? `@${user?.telegram?.username}` : walletAddress;
            const gift = index2 <= 10 ? '🎁' : '';
            message += `${index2}. ${username} (${walletAddress}) - vol: $${entry.totalPoints/100} ${gift}\n`;
            index2++;

            if (index2 == 30){
                break;
            }
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