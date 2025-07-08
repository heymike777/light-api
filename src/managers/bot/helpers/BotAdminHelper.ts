import { Context } from "grammy";
import { LogManager } from "../../LogManager";
import { BotHelper, Message } from "./BotHelper";
import { IUser } from "../../../entities/users/User";
import { UserManager } from "../../UserManager";
import { BotManager } from "../BotManager";
import { InlineButton, TgMessage } from "../BotTypes";
import { ConfigManager } from "../../ConfigManager";
import { EventsManager } from "../../EventsManager";
import { StatusType, Swap } from "../../../entities/payments/Swap";
import { ChainManager } from "../../chains/ChainManager";

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
            await EventsManager.createSoonEvent();
            await BotManager.reply(ctx, 'Event created ✅');
            // const { message, buttons } = await this.buildAdminMessage(user, ctx);
            // const markup = BotManager.buildInlineKeyboard(buttons);
            // await BotManager.editMessage(ctx, message, markup);
        }
        else {
            await super.commandReceived(ctx, user);
        }
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
        for (const volume of volumesByChain){
            message += `\n${ChainManager.getChainTitle(volume._id)}: $${volume.totalVolume.toFixed(2)}`;
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


        return { message, buttons };
    }

}