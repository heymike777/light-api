import { Context } from "grammy";
import { LogManager } from "../../LogManager";
import { BotManager, InlineButton, TgMessage } from "../BotManager";
import { BotHelper, Message } from "./BotHelper";
import { IUser, TelegramWaitingType, User } from "../../../entities/users/User";
import { UserManager } from "../../UserManager";
import { TraderProfilesManager } from "../../TraderProfilesManager";
import { SwapManager } from "../../SwapManager";
import { IUserTraderProfile, UserTraderProfile } from "../../../entities/users/TraderProfile";

export class BotTraderProfilesHelper extends BotHelper {

    constructor() {
        LogManager.log('BotTraderProfilesHelper', 'constructor');

        const buttons: InlineButton[] = [
            {id: 'trader_profiles|create', text: '➕ Add profile'},
        ];

        const replyMessage: Message = {
            text: 'Trader profiles',
            buttons: buttons,
            markup: BotManager.buildInlineKeyboard(buttons),
        };

        super('trader_profiles', replyMessage, ['choose_profile']);
    }

    async commandReceived(ctx: Context, user: IUser) {
        await UserManager.updateTelegramState(user.id, undefined);

        const buttonId = ctx.update?.callback_query?.data;

        console.log('buttonId', buttonId);
        console.log('ctx:', ctx);

        if (ctx?.update?.message?.text == '/choose_profile' || buttonId == 'choose_profile'){
            let traderProfiles = await TraderProfilesManager.getUserTraderProfiles(user.id, SwapManager.kNaviteEngineId);

            const buttons: InlineButton[] = [];
            for (const traderProfile of traderProfiles){
                buttons.push({ id: `trader_profiles|make_default|${traderProfile.id}|select`, text: `${traderProfile.default?'🟢 ':''}${traderProfile.title}` });
            }

            const markup = BotManager.buildInlineKeyboard(buttons);

            await BotManager.reply(ctx, 'Choose your default trader profile', {
                reply_markup: markup,
                parse_mode: 'HTML',
            });
        }
        else if (buttonId && buttonId == 'trader_profiles|create'){
            await BotManager.reply(ctx, 'TODO: create profile');
        }
        // else if (buttonId && buttonId.startsWith('trader_profiles|edit')){
        //     const profileId = buttonId.split('|')[2];
        //     await BotManager.reply(ctx, 'TODO: edit profile ' + profileId);
        // }
        else if (buttonId && buttonId.startsWith('trader_profiles|portfolio')){
            const profileId = buttonId.split('|')[2];
            await BotManager.reply(ctx, 'TODO: portfolio of profile ' + profileId);
        }
        else if (buttonId && buttonId.startsWith('trader_profiles|refresh')){
            const profileId = buttonId.split('|')[2];
            await BotManager.reply(ctx, 'TODO: refresh profile ' + profileId);
        }
        else if (buttonId && buttonId.startsWith('trader_profiles|make_default')){
            const parts = buttonId.split('|');
            const profileId = parts[2];
            const select = parts.length>3 && parts[3] == 'select';

            const updated = await UserTraderProfile.updateOne({ userId: user.id, _id: profileId, default: {$ne: true} }, { $set: { default: true } });
            if (updated.modifiedCount == 1){
                await UserTraderProfile.updateMany({ userId: user.id, _id: {$ne: profileId} }, { $set: { default: false } });
            }

            if (select){
                let traderProfiles = await TraderProfilesManager.getUserTraderProfiles(user.id, SwapManager.kNaviteEngineId);
                const buttons: InlineButton[] = [];
                for (const traderProfile of traderProfiles){
                    buttons.push({ id: `trader_profiles|make_default|${traderProfile.id}|select`, text: `${traderProfile.default?'🟢 ':''}${traderProfile.title}` });
                }
                const markup = BotManager.buildInlineKeyboard(buttons);
                await BotManager.updateMessageReplyMarkup(ctx, markup);
            }

            // await BotManager.reply(ctx, 'TODO: make default profile ' + profileId + ' select: '+ select);
        }
        else {
            let traderProfiles = await TraderProfilesManager.getUserTraderProfiles(user.id, SwapManager.kNaviteEngineId);
            const replyMessage = this.getReplyMessage();
            
            if (traderProfiles.length == 0){
                replyMessage.text += 'You don\'t have any trader profiles yet. You have to create one to start trading.\n\nYou can create multiple trader profiles, if you want to use different strategies. For each trader profile you\'ll have a separate wallet, trading history, and portfolio.';
            }
            else {
                const defaultProfile = traderProfiles.find(tp => tp.default) || traderProfiles[0];

                replyMessage.buttons = replyMessage.buttons || [];
                replyMessage.text = `You have ${traderProfiles.length} trader profile${ traderProfiles.length==1?'':'s' }.`;
                replyMessage.text += `\n\nYou can create multiple trader profiles, if you want to use different strategies. For each trader profile you'll have a separate wallet, trading history, and portfolio.`;

                if (traderProfiles.length > 1){
                    replyMessage.text += `\n\nYour current default trader profile is <b>${defaultProfile.title}</b>. It will be used in all trading operations. You can change it at any time - /choose_profile.`;
                }

                // if (replyMessage.buttons.length > 1){
                    replyMessage.buttons.push({ id: 'choose_profile', text: '⭐️ Choose profile' });
                // }


                if (traderProfiles.length == 1){
                    const { message, buttons } = await this.buildTraderProfileMessage(traderProfiles[0], traderProfiles.length);
                    replyMessage.text += `\n\n---\n\n${message}`;

                    if (replyMessage.buttons.length > 0){
                        replyMessage.buttons.push({ id: 'row', text: '' });
                    }
                    replyMessage.buttons.push(...buttons);
                    replyMessage.markup = BotManager.buildInlineKeyboard(replyMessage.buttons);
                }
            }

            await super.commandReceived(ctx, user, replyMessage);


            if (traderProfiles.length > 1){
                for (const traderProfile of traderProfiles){
                    const { message, buttons } = await this.buildTraderProfileMessage(traderProfile, traderProfiles.length);

                    const markup = BotManager.buildInlineKeyboard(buttons);

                    await BotManager.reply(ctx, message, {
                        reply_markup: markup, 
                        parse_mode: 'HTML',
                    });                
                }
            }

        }
    }

    async buildTraderProfileMessage(traderProfile: IUserTraderProfile, traderProfilesCount: number): Promise<{ message: string, buttons: InlineButton[] }> {
        let message = `<b>${traderProfile.title}</b>` + (traderProfile.default ? ' (default)' : '');
        message += `\n<code>${traderProfile.wallet?.publicKey}</code> (Tap to copy)`; 
        message += `\nBalance: <b>0 SOL</b>`;

        const buttons: InlineButton[] = [];
        // buttons.push({ id: `trader_profiles|edit|${traderProfile.id}`, text: '✏️ Edit' });
        buttons.push({ id: `trader_profiles|portfolio|${traderProfile.id}`, text: '🎨 Portfolio' });
        buttons.push({ id: `trader_profiles|refresh|${traderProfile.id}`, text: '↻ Refresh' });
        if (traderProfilesCount > 1){
            buttons.push({ id: 'row', text: '' });
            buttons.push({ id: `trader_profiles|make_default|${traderProfile.id}`, text: '⭐️ Make default' });    
        }
        buttons.push({ id: `trader_profiles|export|${traderProfile.id}`, text: '📤 Export' });


        return { message, buttons };
    }

}