import { Context } from "grammy";
import { LogManager } from "../../LogManager";
import { BotHelper, Message } from "./BotHelper";
import { IUser, TelegramWaitingType } from "../../../entities/users/User";
import { UserManager } from "../../UserManager";
import { BotManager } from "../BotManager";
import { InlineButton, TgMessage } from "../BotTypes";
import { UserRefCode } from "../../../entities/referrals/UserRefCode";
import { ExplorerManager } from "../../../services/explorers/ExplorerManager";
import { ReferralsManager } from "../../ReferralsManager";
import { Helpers } from "../../../services/helpers/Helpers";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Chain } from "../../../services/solana/types";

//TODO: SVM

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
        else if (ctx?.update?.message?.text == '/referral_program' || buttonId == 'referral_program'){
            const { message, buttons, image } = await this.buildReferralMessage(user, ctx);

            const markup = BotManager.buildInlineKeyboard(buttons);
            await BotManager.replyWithPhoto(ctx, image, message, markup);
        }
        else if (buttonId && buttonId == 'referral_program|refresh'){
            const { message, buttons, image } = await this.buildReferralMessage(user, ctx);

            const markup = BotManager.buildInlineKeyboard(buttons);
            await BotManager.editMessageWithPhoto(ctx, image, message, markup);
        }
        else {
            await super.commandReceived(ctx, user);
        }
    }

    async messageReceived(message: TgMessage, ctx: Context, user: IUser): Promise<boolean> {
        LogManager.log('BotReferralProgramHelper', 'messageReceived', message.text);

        super.messageReceived(message, ctx, user);

        if (user.telegramState?.waitingFor == TelegramWaitingType.ADD_REFCODE){
            const refcode = message.text.trim();

            if (refcode.includes(' ')){
                await BotManager.reply(ctx, '🔴 Refcode cannot contain spaces. Please, try again.');
                return true;
            }
            if (refcode.includes('-')){
                await BotManager.reply(ctx, '🔴 Refcode cannot contain dashes. Please, try again.');
                return true;
            }
            if (refcode.includes('@')){
                await BotManager.reply(ctx, '🔴 Refcode cannot contain @. Please, try again.');
                return true;
            }

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

    async buildReferralMessage(user: IUser, ctx?: Context): Promise<{ message: string, buttons: InlineButton[], image: string }> {
        const refcodes = await UserRefCode.find({ userId: user.id, active: true });
        const refStats = await ReferralsManager.fetchUserRefStats(user.id);

        let message = `💰 `;

        message += user.parent ? `You used someone's refcode and saving 10% on fees.` : `Use someone's refcode to save 10% on fees.`;
        
        message += `\n\nIf you have a premium subscription, you'll get higher rewards from the fees paid by your referrees.\n• FREE users will get 25% share of the fees paid by their referrees\n• SILVER subscribers - 30% fee share\n• GOLD subscriber - 35% fee share\n• PLATINUM subscribers - 40% fee share`;

        const usersCountDirect = refStats?.usersCount.direct || 0;
        const usersCountIndirect = refStats?.usersCount.indirect || 0;
        const rewardsTotalSol = (refStats?.rewards[Chain.SOLANA].rewardsTotal.sol || 0) + (refStats?.rewards[Chain.SONIC].rewardsTotal.sol || 0);
        const rewardsPaidSol = (refStats?.rewards[Chain.SOLANA].rewardsPaid.sol || 0) + (refStats?.rewards[Chain.SONIC].rewardsPaid.sol || 0);
        const rewardsUnpaidSol = rewardsTotalSol - rewardsPaidSol;
        // const rewardsTotalUsdc = refStats?.rewardsTotal.usdc || 0;
        // const rewardsPaidUsdc = refStats?.rewardsPaid.usdc || 0;
        // const rewardsUnpaidUsdc = rewardsTotalUsdc - rewardsPaidUsdc;

        message += `\n\n`;
        message += `Your Referrals (updated every hour)
• Users referred: ${usersCountDirect+usersCountIndirect} (direct: ${usersCountDirect}, indirect: ${usersCountIndirect})
• Total rewards: ${Helpers.prettyNumber(rewardsTotalSol / LAMPORTS_PER_SOL, 6)} SOL
• Total paid: ${Helpers.prettyNumber(rewardsPaidSol / LAMPORTS_PER_SOL, 6)} SOL
• Total unpaid: ${Helpers.prettyNumber(rewardsUnpaidSol / LAMPORTS_PER_SOL, 6)} SOL`;

        message += `\n\n`;
        message += `Rewards are paid daily and airdropped directly to your main trader profile wallet. <u><b>You must have accrued at least 0.005 SOL in unpaid fees to be eligible for a payout.</b></u>`;

        // message += `\n\n`;
        // message += `We've established a tiered referral system, ensuring that as more individuals come onboard, rewards extend through five different layers of users. This structure not only benefits community growth but also significantly increases the percentage share of fees for everyone.`;

        message += `\n\n`;
        message += `📚 Full details - <a href="https://docs.light.app/referrals">Click Here</a>!`

        message += `\n\n`;
        message += `<u><b>Your Referral Link:</b></u>`;
        if (refcodes.length > 0){
            const botUsername = ctx ? BotManager.getBotUsername(ctx) : undefined;
            const reflink = ExplorerManager.getReflink(user.referralCode, botUsername); 
            message += `\n<code>${reflink}</code>`;                

            // for (const refcode of refcodes){
            //     const reflink = ExplorerManager.getReflink(refcode.code, botUsername); 
            //     message += `\n<code>${reflink}</code>`;                
            // }
        }
        else {
            message += `\nYou don't have any reflinks yet`;
        }

        console.log('message.length:', message.length);

        const buttons: InlineButton[] = [];
        buttons.push({ id: `referral_program|refresh`, text: '↻ Refresh' });
        buttons.push({ id: `delete_message`, text: '✕ Close' });
        // buttons.push({ id: `row`, text: '' });
        // buttons.push({ id: `referral_program|qr_code`, text: 'QR code' });
        // buttons.push({ id: `referral_program|add_refcode`, text: 'Update reflink' });
        // buttons.push({ id: `referral_program|wallet`, text: 'Rewards wallet' });

        const image = 'https://light.dangervalley.com/static/telegram/referral_tree_2.png';

        return { message, buttons, image };
    }


}