import { Context } from "grammy";
import { UserManager } from "../../UserManager";
import { BotHelper, Message } from "./BotHelper";
import { IUser, TelegramWaitingType, User } from "../../../entities/users/User";
import { BotManager } from "../BotManager";
import { TraderProfilesManager } from "../../TraderProfilesManager";
import { Currency } from "../../../models/types";
import { TokenManager } from "../../TokenManager";
import { LogManager } from "../../LogManager";
import { TgMessage } from "../BotTypes";
import { SwapManager } from "../../SwapManager";
import { SwapDex } from "../../../entities/payments/Swap";
import { ExplorerManager } from "../../../services/explorers/ExplorerManager";

export class BotBuyHelper extends BotHelper {

    constructor() {
        const replyMessage: Message = {
            text: 'Enter a token symbol or address to buy'
        };

        super('buy', replyMessage);
    }

    async commandReceived(ctx: Context, user: IUser) {
        await UserManager.updateTelegramState(user.id, undefined);

        const buttonId = ctx.update?.callback_query?.data;

        if (ctx?.update?.message?.text == '/buy' || buttonId == 'buy'){
            return await super.commandReceived(ctx, user);
        }
        else if (buttonId && buttonId.startsWith('buy|')){
            const parts = buttonId.split('|');
            if (parts.length == 4){
                const chain = parts[1];
                const mint = parts[2];

                const traderProfile = await TraderProfilesManager.getUserDefaultTraderProfile(user.id);
                if (!traderProfile){
                    await BotManager.reply(ctx, '🟡 Please, create a trader profile first');
                    return;
                }

                const currency = traderProfile.currency || Currency.SOL;

                if (parts[3] == 'refresh'){
                    const token = await TokenManager.getToken(mint);
                    if (token){
                        const { message, markup } = await BotManager.buildBuyMessageForToken(token, user, traderProfile);
                        await BotManager.editMessage(ctx, message, markup);
                    }
                }
                else if (parts[3] == 'x' || parts[3] == 'X') {
                    await UserManager.updateTelegramState(user.id, { waitingFor: TelegramWaitingType.BUY_AMOUNT, data: { chain, mint, traderProfileId: traderProfile?.id, currency }, helper: this.kCommand });
                    await BotManager.reply(ctx, `Enter ${currency} amount`);
                }
                else {
                    const amount = parseFloat(parts[3]);
                    if (amount > 0){
                        await this.buy(ctx, user, chain, mint, amount, currency, traderProfile.id);
                    }
                }
            }
            else {
                console.error('Invalid buttonId:', buttonId);
            }
        }
    }

    async messageReceived(message: TgMessage, ctx: Context, user: IUser): Promise<boolean> {
        LogManager.log('BotBuylHelper', 'messageReceived', message.text);

        super.messageReceived(message, ctx, user);

        if (user.telegramState?.waitingFor == TelegramWaitingType.BUY_AMOUNT){
            const amoountString = message.text.trim();
            const amount = parseFloat(amoountString);
            if (isNaN(amount) || amount <= 0){
                await BotManager.reply(ctx, 'Invalid amount. Please, try again.');
                return false;
            }

            const chain = user.telegramState.data.chain;
            const mint = user.telegramState.data.mint;
            const currency = user.telegramState.data.currency;
            const traderProfileId = user.telegramState.data.traderProfileId;

            await this.buy(ctx, user, chain, mint, amount, currency, traderProfileId);

            await UserManager.updateTelegramState(user.id, undefined);
            return true;
        }

        return false;
    }

    async buy(ctx: Context, user: IUser, chain: string, mint: string, amount: number, currency: Currency, traderProfileId: string) {
        const signature = await SwapManager.initiateBuy(SwapDex.JUPITER, traderProfileId, mint, amount);
        await BotManager.reply(ctx, `Buy ${mint} for ${amount} ${currency} on ${chain}\n\nTX: ${signature ? ExplorerManager.getUrlToTransaction(signature) : undefined}`);        
    }

}