import { Context } from "grammy";
import { LogManager } from "../../LogManager";
import { BotHelper, Message } from "./BotHelper";
import { IUser, TelegramWaitingType } from "../../../entities/users/User";
import { UserManager } from "../../UserManager";
import { BotManager } from "../BotManager";
import { InlineButton, TgMessage } from "../BotTypes";
import { UserRefCode } from "../../../entities/users/UserRefCode";
import { ExplorerManager } from "../../../services/explorers/ExplorerManager";
import { ReferralsManager } from "../../ReferralsManager";

export class BotReferralProgramHelper extends BotHelper {

    constructor() {
        LogManager.log('BotReferralProgramHelper', 'constructor');
        const replyMessage: Message = { text: '⏰ Referral program is coming very soon' };
        super('referral_program', replyMessage, ['ambassador']);
    }

    async commandReceived(ctx: Context, user: IUser) {
        await UserManager.updateTelegramState(user.id, undefined);

        let buttonId = ctx.update?.callback_query?.data;
        const botUsername = BotManager.getBotUsername(ctx);

        if (ctx?.update?.message?.text == '/ambassador' || buttonId == 'ambassador'){
            const { message, buttons } = await this.buildAmbassadorMessage(user);

            const markup = BotManager.buildInlineKeyboard(buttons);
            await BotManager.reply(ctx, message, {
                reply_markup: markup,
                parse_mode: 'HTML',
            });
        }
        else if (buttonId && buttonId == 'ambassador|refresh'){
            const { message, buttons } = await this.buildAmbassadorMessage(user, ctx);
            const markup = BotManager.buildInlineKeyboard(buttons);
            await BotManager.editMessage(ctx, message, markup);
        }
        else if (buttonId && buttonId == 'ambassador|add_refcode'){
            await UserManager.updateTelegramState(user.id, { waitingFor: TelegramWaitingType.ADD_REFCODE, helper: this.kCommand });
            await BotManager.reply(ctx, 'Enter your refcode');   
        }

        // else if (buttonId && buttonId == 'trader_profiles|create'){
        //     const countAll = await UserTraderProfile.countDocuments({ userId: user.id });
        //     const engineId = SwapManager.kNativeEngineId;
        //     const title = `Wallet ${countAll+1}`;
        //     const defaultAmount = 0.25;
        //     const slippage = 10;

        //     try {
        //         const traderProfile = await TraderProfilesManager.createTraderProfile(user, engineId, title, Priority.MEDIUM, defaultAmount, slippage, undefined);

        //         const { message, buttons } = await this.buildTraderProfileMessage(traderProfile, 0);
        //         const markup = BotManager.buildInlineKeyboard(buttons);
        //         await BotManager.reply(ctx, message, {
        //             reply_markup: markup,
        //             parse_mode: 'HTML',
        //         });
        //     }
        //     catch (e: any){
        //         LogManager.error('e:', e);
        //         if (e.statusCode == 444){
        //             // premium error
        //             await BotManager.replyWithPremiumError(ctx, e.message);
        //         }
        //         else {
        //             await BotManager.reply(ctx, e.message);
        //         }
        //     }
        // }
        else {
            await super.commandReceived(ctx, user);
        }
    }

        async messageReceived(message: TgMessage, ctx: Context, user: IUser): Promise<boolean> {
            LogManager.log('BotReferralProgramHelper', 'messageReceived', message.text);
    
            super.messageReceived(message, ctx, user);
    
            if (user.telegramState?.waitingFor == TelegramWaitingType.ADD_REFCODE){
                const refcode = message.text.trim();
    
                const isValid = await ReferralsManager.isValidReferralCode(refcode);
                if (!isValid){
                    await BotManager.reply(ctx, 'Invalid refcode. Please, try again.');
                    return true;
                }

                await ReferralsManager.saveReferralCode(user, refcode);

                await BotManager.reply(ctx, `<code>${refcode}</code> refcode added ✅`);
                await UserManager.updateTelegramState(user.id, undefined);

                return true;
            }
    
            return false;
        }

    async buildAmbassadorMessage(user: IUser, ctx?: Context): Promise<{ message: string, buttons: InlineButton[] }> {
        const refcodes = await UserRefCode.find({ userId: user.id, active: true });

        let message = `👑 Ambassador profile`;

        message += `\n\n`;
        message += `Your refcodes:`;
        if (refcodes.length > 0){
            const botUsername = ctx ? BotManager.getBotUsername(ctx) : undefined;
            for (const refcode of refcodes){
                const reflink = ExplorerManager.getReflink(refcode.code, botUsername); 
                message += `\n<code>${refcode.code}</code> <a href="${reflink}">Share reflink</a>`;                
            }
        }
        else {
            message += `\nYou don't have any refcodes yet`;
        }

        const buttons: InlineButton[] = [];
        buttons.push({ id: `ambassador|refresh`, text: '↻ Refresh' });
        buttons.push({ id: `ambassador|add_refcode`, text: '➕ Add refcode' });

        return { message, buttons };
    }

}