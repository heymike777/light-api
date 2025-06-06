import { Context } from "grammy";
import { UserManager } from "../../UserManager";
import { BotHelper, Message } from "./BotHelper";
import { IUser, TelegramWaitingType } from "../../../entities/users/User";
import { BotManager } from "../BotManager";
import { TraderProfilesManager } from "../../TraderProfilesManager";
import { Currency } from "../../../models/types";
import { TokenManager } from "../../TokenManager";
import { LogManager } from "../../LogManager";
import { TgMessage } from "../BotTypes";
import { SwapManager } from "../../SwapManager";
import { SwapDex } from "../../../entities/payments/Swap";
import { ExplorerManager } from "../../../services/explorers/ExplorerManager";
import { Chain } from "../../../services/solana/types";

export class BotSellHelper extends BotHelper {

    constructor() {
        const replyMessage: Message = {
            text: 'sell?'
        };

        super('sell', replyMessage, ['sell_lp']);
    }

    async commandReceived(ctx: Context, user: IUser) {
        await UserManager.updateTelegramState(user.id, undefined);

        const buttonId = ctx.update?.callback_query?.data;
        const botUsername = BotManager.getBotUsername(ctx);

        console.log('BotSellHelper', 'commandReceived', buttonId);

        if (ctx?.update?.message?.text == '/sell' || buttonId == 'sell'){
            const traderProfile = await TraderProfilesManager.getUserDefaultTraderProfile(user.id);
            if (!traderProfile){
                await BotManager.reply(ctx, '🟡 Please, create a trader profile first');
                return;
            }

            const { message } = await BotManager.buildPortfolioMessage(user, traderProfile, botUsername);

            await BotManager.reply(ctx, message, {
                parse_mode: 'HTML',
                reply_markup: BotManager.buildInlineKeyboard([
                    { id: `trader_profiles|portfolio|${traderProfile.id}|refresh`, text: '↻ Refresh' },
                ]),
            });    

        }
        else if (buttonId && (buttonId.startsWith('sell|') || buttonId.startsWith('sell_lp|'))){
            const parts = buttonId.split('|');
            const isHoneypot = buttonId.startsWith('sell_lp|');    
            if (parts.length == 4){
                const chain = parts[1] as Chain;
                const mint = parts[2];

                const traderProfile = await TraderProfilesManager.getUserDefaultTraderProfile(user.id);
                if (!traderProfile){
                    await BotManager.reply(ctx, '🟡 Please, create a trader profile first');
                    return;
                }

                const currency = traderProfile.currency || Currency.SOL;

                if (parts[3] == 'x' || parts[3] == 'X') {
                    const waitingFor = isHoneypot ? TelegramWaitingType.SELL_LP_AMOUNT : TelegramWaitingType.SELL_AMOUNT;
                    await UserManager.updateTelegramState(user.id, { waitingFor, data: { chain, mint, traderProfileId: traderProfile?.id, currency }, helper: this.kCommand });
                    await BotManager.reply(ctx, `Enter % to sell (e.g. "50%" or "50")`);
                }
                else {
                    const amount = parseFloat(parts[3]);
                    if (amount > 0){
                        await this.sell(ctx, user, chain, mint, amount, currency, traderProfile.id, isHoneypot);
                    }
                }
            }
            else {
                LogManager.error('Invalid buttonId:', buttonId);
            }
        }
    }

    async messageReceived(message: TgMessage, ctx: Context, user: IUser): Promise<boolean> {
        LogManager.log('BotSelllHelper', 'messageReceived', message.text);

        super.messageReceived(message, ctx, user);

        if (user.telegramState?.waitingFor == TelegramWaitingType.SELL_AMOUNT || user.telegramState?.waitingFor == TelegramWaitingType.SELL_LP_AMOUNT){
            const isHoneypot = user.telegramState?.waitingFor == TelegramWaitingType.SELL_LP_AMOUNT;
            const amountString = message.text.trim().replaceAll(',', '.').replace('%', '');
            const amount = parseFloat(amountString);
            if (isNaN(amount) || amount <= 0 || amount > 100){
                await BotManager.reply(ctx, 'Invalid amount. Please, try again.');
                return false;
            }

            const chain: Chain = user.telegramState.data.chain;
            const mint: string = user.telegramState.data.mint;
            const currency: Currency = user.telegramState.data.currency;
            const traderProfileId: string = user.telegramState.data.traderProfileId;

            await this.sell(ctx, user, chain, mint, amount, currency, traderProfileId, isHoneypot);

            await UserManager.updateTelegramState(user.id, undefined);
            return true;
        }

        return false;
    }

    async sell(ctx: Context, user: IUser, chain: Chain, mint: string, amountPercent: number, currency: Currency, traderProfileId: string, isHoneypot: boolean) {
        console.log('sell', 'isHoneypot:', isHoneypot, 'amountPercent:', amountPercent, 'chain:', chain, 'mint:', mint, 'currency:', currency, 'traderProfileId:', traderProfileId);
        let tokenName: string | undefined = mint;
        try {
            const token = await TokenManager.getToken(chain, mint);
            if (token?.symbol){
                tokenName = token.symbol;
            }
        } catch (error: any) {}

        const message = await BotManager.reply(ctx, `Selling ${amountPercent}% of <a href="${ExplorerManager.getUrlToAddress(chain, mint)}">${tokenName}</a>.\n\nPlease, wait...`);      

        try {            
            const { signature, swap } = await SwapManager.initiateSell(user, chain, traderProfileId, mint, amountPercent, isHoneypot);

            // let msg = `🟢 Sold <a href="${ExplorerManager.getUrlToAddress(chain, mint)}">${tokenName}</a>.`
            let msg = `🟡 Transaction sent. Waiting for confirmation.`;
            if (swap.intermediateWallet){
                msg += `\n\nIntermediate wallet:\n<code>${swap.intermediateWallet.publicKey}</code> (Tap to copy)`;
            }
            if (signature){
                msg += '\n\n';
                msg += `<a href="${ExplorerManager.getUrlToTransaction(chain, signature)}">Explorer</a>`;
            }
            if (message){
                await BotManager.editMessage(ctx, msg, undefined, message.message_id);
            }
            else {
                await BotManager.reply(ctx, msg);
            }
        }
        catch (error: any) {
            const msg = `🔴 Error selling <a href="${ExplorerManager.getUrlToAddress(chain, mint)}">${tokenName}</a>. Try again.\n\nError: ${error.message}`;

            if (message){
                await BotManager.editMessage(ctx, msg, undefined, message.message_id);
            }
            else {
                await BotManager.reply(ctx, msg);
            }
        }
    }

}