import { Context } from "grammy";
import { LogManager } from "../../LogManager";
import { BotHelper, Message } from "./BotHelper";
import { IUser } from "../../../entities/users/User";
import { UserManager } from "../../UserManager";
import { BotManager } from "../BotManager";
import { InlineButton } from "../BotTypes";
import { SubscriptionPeriod, SubscriptionPlatform, SubscriptionTier } from "../../../entities/payments/Subscription";
import { TraderProfilesManager } from "../../TraderProfilesManager";
import { SubscriptionManager } from "../../SubscriptionManager";

export class BotUpgradeHelper extends BotHelper {

    constructor() {
        LogManager.log('BotUpgradeHelper', 'constructor');
        const replyMessage: Message = { text: '👑 Premium subscriptions are coming soon' };
        super('upgrade', replyMessage, ['premium']);
    }

    async commandReceived(ctx: Context, user: IUser) {
        await UserManager.updateTelegramState(user.id, undefined);

        const buttonId = ctx.update?.callback_query?.data;
        const botUsername = BotManager.getBotUsername(ctx);

        if (ctx?.update?.message?.text == '/upgrade' || buttonId == 'upgrade' || ctx?.update?.message?.text == '/premium' || buttonId == 'premium'){
            const replyMessage = await this.buildUpgradeMessage(user, botUsername);
            return await super.commandReceived(ctx, user, replyMessage);
        }
        else if (buttonId && buttonId.startsWith('upgrade|') && buttonId.split('|').length == 3){
            const parts = buttonId.split('|');
            const tier = parts[1] as SubscriptionTier;
            const period = parts[2] as SubscriptionPeriod;

            let text = `💰 You are about to upgrade to ${tier} (${period}) plan.\n\n`;
            await BotManager.reply(ctx, text);
            
            if (user.subscription?.platform == SubscriptionPlatform.REVENUECAT){
                text = `⚠️ You already have a subscription in mobile app. Please, manage your subscription in the app.`;
                await BotManager.reply(ctx, text);
                return;
            }
            else if (user.subscription?.platform == SubscriptionPlatform.SOLANA){
                if (user.subscription?.tier == tier && user.subscription?.period == period){
                    text = `⚠️ You already have an active subscription.`;
                    await BotManager.reply(ctx, text);
                    return;
                }

                //TODO: if user already have active CRYPTO subscription, and if he upgrades to a higher tier, recalc his dates and no charge for now
            }
            else if (user.subscription?.platform == SubscriptionPlatform.GIFT_CARD){
                //TODO: try to buy a subscription with Crypto. If it succeeds, then end the GIFT_CARD subscription
            }
            else {
                //TODO: just buy a subscription with Crypto
            }



        }
    }

    // async refresh(ctx: Context, user: IUser) {
    //     const botUsername = BotManager.getBotUsername(ctx);

    //     const message = await this.buildUpgradeMessage(user, botUsername);
    //     await BotManager.editMessage(ctx, message.text, message.markup);
    // }

    async buildUpgradeMessage(user: IUser, botUsername: string): Promise<Message> {
        const traderProfile = await TraderProfilesManager.getUserDefaultTraderProfile(user.id);

        const plans = SubscriptionManager.getPrices();
        const userPlan = user.subscription?.tier;
        const userPlanTitle = userPlan ? userPlan.charAt(0).toUpperCase() + userPlan.slice(1) : 'Free';

        let text = `👑 Your current plan: ${userPlanTitle}`;
        text += `\n\n`;
        text += `✨ Upgrade to Premium to track more wallets and get higher referral fees!`;
        text += `\n\n`;
        text += `💰 Premium plans:`;
        text += `\nSilver: $${plans[SubscriptionTier.SILVER].month}/mo or $${plans[SubscriptionTier.SILVER].year}/yr`;
        text += `\nGold: $${plans[SubscriptionTier.GOLD].month}/mo or $${plans[SubscriptionTier.GOLD].year}/yr`;
        text += `\nPlatinum: $${plans[SubscriptionTier.PLATINUM].month}/mo or $${plans[SubscriptionTier.PLATINUM].year}/yr`;

        text += `\n\n`;
        text += `✨ Follow these steps to upgrade:`
        text += `\n1. Send enough SOL or USDC to your main wallet:\n<code>${traderProfile?.encryptedWallet?.publicKey || 'N/A'}</code> (Tap to copy)`;
        text += `\n2. Select plan below`;
        text += `\n3. Done!`;
    
        let buttons: InlineButton[] = [];
        buttons.push({ id: `upgrade|silver|month`, text: `Silver: $${plans[SubscriptionTier.SILVER].month}/mo` });
        buttons.push({ id: `upgrade|silver|year`, text: `Silver: $${plans[SubscriptionTier.SILVER].year}/yr` });
        buttons.push({ id: 'row', text: '' });
        buttons.push({ id: `upgrade|gold|month`, text: `Gold: $${plans[SubscriptionTier.GOLD].month}/mo` });
        buttons.push({ id: `upgrade|gold|year`, text: `Gold: $${plans[SubscriptionTier.GOLD].year}/yr` });
        buttons.push({ id: 'row', text: '' });
        buttons.push({ id: `upgrade|platinum|month`, text: `Platinum: $${plans[SubscriptionTier.PLATINUM].month}/mo` });
        buttons.push({ id: `upgrade|platinum|year`, text: `Platinum: $${plans[SubscriptionTier.PLATINUM].year}/yr` });
        buttons.push({ id: 'row', text: '' });
        buttons.push({ id: `delete_message`, text: '✕ Close' });

        const markup = BotManager.buildInlineKeyboard(buttons);
        return { text, markup, buttons };
    }

}