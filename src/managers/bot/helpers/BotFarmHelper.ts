import { Context } from "grammy";
import { UserManager } from "../../UserManager";
import { BotHelper, Message } from "./BotHelper";
import { IUser, TelegramWaitingType, User } from "../../../entities/users/User";
import { BotManager } from "../BotManager";
import { TraderProfilesManager } from "../../TraderProfilesManager";
import { Currency } from "../../../models/types";
import { TokenManager } from "../../TokenManager";
import { LogManager } from "../../LogManager";
import { BotKeyboardMarkup, InlineButton, TgMessage } from "../BotTypes";
import { SwapManager } from "../../SwapManager";
import { ExplorerManager } from "../../../services/explorers/ExplorerManager";
import { Chain, DexId } from "../../../services/solana/types";
import { getNativeToken } from "../../../services/solana/Constants";
import { Farm, FarmStatus, FarmType, IFarm } from "../../../entities/Farm";

type Dex = {
    id: DexId;
    name: string;
}

export class BotFarmHelper extends BotHelper {

    private static DEXES: { [key: string]: Dex[] } = {
        [Chain.SONIC]: [
            { id: DexId.SEGA, name: 'Sega' }
        ]
    }
    private static FREQUENCIES: ({seconds: number, title: string, default: boolean} | undefined)[] = [
        { seconds: 5, title: '5s', default: true },
        { seconds: 10, title: '10s', default: false },
        { seconds: 30, title: '30s', default: false },
        { seconds: 60, title: '1m', default: false },
        { seconds: 120, title: '2m', default: false },
        undefined,
        { seconds: 300, title: '5m', default: false },
        { seconds: 600, title: '10m', default: false },
        { seconds: 1800, title: '30m', default: false },
        { seconds: 3600, title: '1h', default: false },
        { seconds: -1, title: 'Custom', default: false },

    ];

    private static VOLUMES: ({usd: number, title: string, default: boolean, minSolAmount: number} | undefined)[] = [
        { usd: 50000, title: '$50k', default: false, minSolAmount: 1 },
        { usd: 100000, title: '$100k', default: true, minSolAmount: 2 },
        { usd: 500000, title: '$500k', default: false, minSolAmount: 10 },
        undefined,
        { usd: 1000000, title: '$1M', default: false, minSolAmount: 20 },
        { usd: 5000000, title: '$5M', default: false, minSolAmount: 100 },
        { usd: -1, title: 'Custom', default: false, minSolAmount: 0 },
    ];

    constructor() {
        const replyMessage: Message = {
            text: '⛏️ Pump farm'
        };

        super('farm', replyMessage);
    }

    async commandReceived(ctx: Context, user: IUser) {
        await UserManager.updateTelegramState(user.id, undefined);

        const buttonId = ctx.update?.callback_query?.data;

        if (ctx?.update?.message?.text == '/farm' || buttonId == 'farm'){

            const replyMessage = await BotFarmHelper.buildInitReplyMessage(user);
            return await super.commandReceived(ctx, user, replyMessage);
        }
        else if (buttonId == 'farm|dex'){
            const replyMessage = await BotFarmHelper.buildFarmDexMessage(user);
            return await super.commandReceived(ctx, user, replyMessage);
        }
        else if (buttonId == 'farm|token'){
            //TODO: do noting for now. we'll add token volume boost later.
        }
        // else if (buttonId && buttonId.startsWith('buy|')){
        //     const parts = buttonId.split('|');
        //     if (parts.length == 4){
        //         const chain = parts[1] as Chain;
        //         const mint: string = parts[2];

        //         const traderProfile = await TraderProfilesManager.getUserDefaultTraderProfile(user.id);
        //         if (!traderProfile){
        //             await BotManager.reply(ctx, '🟡 Please, create a trader profile first');
        //             return;
        //         }

        //         const currency = traderProfile.currency || Currency.SOL;

        //         if (parts[3] == 'refresh'){
        //             const token = await TokenManager.getToken(chain, mint);
        //             if (token){
        //                 const botUsername = BotManager.getBotUsername(ctx);
        //                 const { message, markup } = await BotManager.buildBuyMessageForToken(token, user, traderProfile, botUsername);
        //                 await BotManager.editMessage(ctx, message, markup);
        //             }
        //         }
        //         else if (parts[3] == 'x' || parts[3] == 'X') {
        //             const currencyName = currency == Currency.SOL ? getNativeToken(chain).symbol : currency;

        //             await UserManager.updateTelegramState(user.id, { waitingFor: TelegramWaitingType.BUY_AMOUNT, data: { chain, mint, traderProfileId: traderProfile?.id, currency }, helper: this.kCommand });
        //             await BotManager.reply(ctx, `Enter ${currencyName} amount`);
        //         }
        //         else {
        //             const amount = parseFloat(parts[3]);
        //             if (amount > 0){
        //                 await this.buy(ctx, user, chain, mint, amount, currency, traderProfile.id);
        //             }
        //         }
        //     }
        //     else {
        //         LogManager.error('Invalid buttonId:', buttonId);
        //     }
        // }
    }

    // async messageReceived(message: TgMessage, ctx: Context, user: IUser): Promise<boolean> {
    //     LogManager.log('BotBuylHelper', 'messageReceived', message.text);

    //     super.messageReceived(message, ctx, user);

    //     if (user.telegramState?.waitingFor == TelegramWaitingType.BUY_AMOUNT){
    //         const amountString = message.text.trim().replaceAll(',', '.');
    //         const amount = parseFloat(amountString);
    //         if (isNaN(amount) || amount <= 0){
    //             await BotManager.reply(ctx, 'Invalid amount. Please, try again.');
    //             return false;
    //         }

    //         const chain: Chain = user.telegramState.data.chain;
    //         const mint: string = user.telegramState.data.mint;
    //         const currency: Currency = user.telegramState.data.currency;
    //         const traderProfileId: string = user.telegramState.data.traderProfileId;

    //         await this.buy(ctx, user, chain, mint, amount, currency, traderProfileId);

    //         await UserManager.updateTelegramState(user.id, undefined);
    //         return true;
    //     }

    //     return false;
    // }

    // async buy(ctx: Context, user: IUser, chain: Chain, mint: string, amount: number, currency: Currency, traderProfileId: string) {
    //     let tokenName: string | undefined = mint;
    //     try {
    //         const token = await TokenManager.getToken(chain, mint);
    //         if (token?.symbol){
    //             tokenName = token.symbol;
    //         }
    //     } catch (error: any) {
    //         LogManager.error('Error getting token', error);
    //     }

    //     const kSOL = getNativeToken(chain);
    //     const currencyName = currency == Currency.SOL ? kSOL.symbol : currency;

    //     const message = await BotManager.reply(ctx, `Buying <a href="${ExplorerManager.getUrlToAddress(chain, mint)}">${tokenName}</a> for ${amount} ${currencyName}.\n\nPlease, wait...`);      

    //     try {
    //         const { signature, swap } = await SwapManager.initiateBuy(user, chain, traderProfileId, mint, amount);

    //         let msg = `🟡 Transaction sent. Waiting for confirmation.`
    //         if (swap.intermediateWallet){
    //             msg += `\n\nIntermediate wallet:\n<code>${swap.intermediateWallet.publicKey}</code> (Tap to copy)`;
    //         }
    //         if (signature){
    //             msg += '\n\n';
    //             msg += `<a href="${ExplorerManager.getUrlToTransaction(chain, signature)}">Explorer</a>`;
    //         }
    //         if (message){
    //             await BotManager.editMessage(ctx, msg, undefined, message.message_id);
    //         }
    //         else {
    //             await BotManager.reply(ctx, msg);
    //         }
    //     }
    //     catch (error: any) {
    //         const msg = `🔴 Error buying <a href="${ExplorerManager.getUrlToAddress(chain, mint)}">${tokenName}</a> for ${amount} ${currencyName}. Try again.\n\nError: ${error.message}`;

    //         if (message){
    //             await BotManager.editMessage(ctx, msg, undefined, message.message_id);
    //         }
    //         else {
    //             await BotManager.reply(ctx, msg);
    //         }
    //     }
    // }

    static async buildLimitChainMessage(): Promise<Message> {
        const buttons: InlineButton[] = [
            { id: `settings|set_chain|${Chain.SONIC}`, text: `🔗 Switch to Sonic SVM` }
        ];
        const markup = BotManager.buildInlineKeyboard(buttons);
        return { 
            text: '⛏️ Pump farm is only available on Sonic SVM for now.',
            buttons: buttons,
            markup: markup
        };    
    }

    static async buildInitReplyMessage(user: IUser): Promise<Message> {
        if (user.defaultChain != Chain.SONIC){
            return this.buildLimitChainMessage();
        }

        const buttons: InlineButton[] = [
            { id: 'farm|token', text: '🔥 Token volume (soon)' },
            { id: 'farm|dex', text: '💰 DEX volume' },
        ];
        const markup = BotManager.buildInlineKeyboard(buttons);

        return {
            text: '⛏️ Pump farm\n\nDo you want to boost a specific token volume or farm DEX volume?',
            buttons: buttons,
            markup: markup
        };
    }

    static async buildFarmDexMessage(user: IUser, farm?: IFarm): Promise<Message> {
        const chain = user.defaultChain || Chain.SOLANA;
        const dexes = BotFarmHelper.DEXES[chain];
        if (!dexes){
            return this.buildLimitChainMessage();
        }

        const traderProfiles = await TraderProfilesManager.getUserTraderProfiles(user.id, SwapManager.kNativeEngineId);

        if (!farm){
            const traderProfile = traderProfiles.find(tp => tp.default);

            farm = new Farm();
            farm.userId = user.id;
            farm.traderProfileId = traderProfile?.id;
            farm.status = FarmStatus.CREATED;
            farm.type = FarmType.DEX;
            farm.dexId = dexes[0].id;
            farm.frequency = BotFarmHelper.FREQUENCIES.find(f => f?.default)?.seconds || 5;
            farm.volume = BotFarmHelper.VOLUMES.find(v => v?.default)?.usd || 100000;
            await farm.save();
        }


        const buttons: InlineButton[] = [];

        buttons.push({ id: 'none', text: '--------------- SELECT DEX ---------------' });
        buttons.push({ id: 'row', text: '' });
        buttons.push(...dexes.map(dex => ({ id: `farm|dex|${dex.id}`, text: (farm.dexId == dex.id ? '🟢 ' : '') + dex.name })));
        buttons.push({ id: 'row', text: '' });
        buttons.push({ id: 'none', text: '-------- SELECT TRADER PROFILE --------' });
        buttons.push({ id: 'row', text: '' });
        let profileIndex = 0;
        for (const traderProfile of traderProfiles) {
            buttons.push({ id: `farm|${farm.id}|prof|${traderProfile.id}`, text: (farm.traderProfileId == traderProfile.id ? '🟢 ' : '') + traderProfile.title });
            profileIndex++;
            if (profileIndex % 3 == 0){
                buttons.push({ id: 'row', text: '' });
            }
        }
        buttons.push({ id: `trader_profiles|create`, text: '➕ Add' }); //TODO: make trader_profiles|create|fast - and create it instantly without user interaction
        buttons.push({ id: 'row', text: '' });
        buttons.push({ id: 'none', text: '----- SELECT TIME BETWEEN SWAPS -----' });
        buttons.push({ id: 'row', text: '' });
        buttons.push(...BotFarmHelper.FREQUENCIES.map(f => (f ? { id: `farm|${farm.id}|frequency|${f.seconds}`, text: (farm.frequency == f.seconds ? '🟢 ' : '') + f.title } : { id: 'row', text: '' })));
        buttons.push({ id: 'row', text: '' });
        buttons.push({ id: 'none', text: '------------- SELECT VOLUME -------------' });
        buttons.push({ id: 'row', text: '' });
        buttons.push(...BotFarmHelper.VOLUMES.map(v => (v ? { id: `farm|${farm.id}|volume|${v.usd}`, text: (farm.volume == v.usd ? '🟢 ' : '') + v.title } : { id: 'row', text: '' })));
        buttons.push({ id: 'row', text: '' });
        buttons.push({ id: 'none', text: '--------------- ACTIONS ---------------' });
        buttons.push({ id: 'row', text: '' });
        buttons.push({ id: `farm|${farm.id}|refresh`, text: '↻ Refresh' });
        buttons.push({ id: `delete_message`, text: '✕ Close' });
        buttons.push({ id: `farm|${farm.id}|continue`, text: '🏁 Start' });

        const markup = BotManager.buildInlineKeyboard(buttons);

        return {
            text: '⛏️ Create a farm\n\nSelect a DEX, frequency and expected volume.\n\n👇 When you\'re ready, click “Continue” to start the bot.',
            buttons: buttons,
            markup: markup
        };
    }

}