import { Context } from "grammy";
import { LogManager } from "../../LogManager";
import { BotManager, InlineButton, TgMessage } from "../BotManager";
import { BotHelper, Message } from "./BotHelper";
import { IUser, TelegramWaitingType, User } from "../../../entities/users/User";
import { UserManager } from "../../UserManager";
import { TraderProfilesManager } from "../../TraderProfilesManager";
import { SwapManager } from "../../SwapManager";
import { IUserTraderProfile, UserTraderProfile } from "../../../entities/users/TraderProfile";
import { CustomError } from "../../../errors/CustomError";
import { parse } from "path";

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

        if (ctx?.update?.message?.text == '/choose_profile' || buttonId == 'choose_profile'){
            let traderProfiles = await TraderProfilesManager.getUserTraderProfiles(user.id, SwapManager.kNativeEngineId);

            const buttons: InlineButton[] = [];
            for (const traderProfile of traderProfiles){
                if (buttons.length > 0){
                    buttons.push({ id: 'row', text: '' });
                }
                buttons.push({ id: `trader_profiles|make_default|${traderProfile.id}|select`, text: `${traderProfile.default?'⭐️ ':''}${traderProfile.title}` });
            }

            const markup = BotManager.buildInlineKeyboard(buttons);

            await BotManager.reply(ctx, 'Choose your default trader profile', {
                reply_markup: markup,
                parse_mode: 'HTML',
            });
        }
        else if (buttonId && buttonId == 'trader_profiles|create'){
            const countAll = await UserTraderProfile.countDocuments({ userId: user.id });
            const engineId = SwapManager.kNativeEngineId;
            const title = `Wallet ${countAll+1}`;
            const defaultAmount = 0.25;
            const slippage = 10;

            try {
                const traderProfile = await TraderProfilesManager.createTraderProfile(user, engineId, title, defaultAmount, slippage, undefined);

                const { message, buttons } = await this.buildTraderProfileMessage(traderProfile);
                const markup = BotManager.buildInlineKeyboard(buttons);
                await BotManager.reply(ctx, message, {
                    reply_markup: markup,
                    parse_mode: 'HTML',
                });
            }
            catch (e: any){
                console.log('e:', e);
                if (e.statusCode == 444){
                    // premium error
                    await BotManager.replyWithPremiumError(ctx, e.message);
                }
                else {
                    await BotManager.reply(ctx, e.message);
                }
            }
        }
        else if (buttonId && buttonId.startsWith('trader_profiles|show')){
            const parts = buttonId.split('|');
            const profileId = parts[2];

            let traderProfile = await TraderProfilesManager.getUserTraderProfile(user.id, profileId);
            if (!traderProfile){
                await BotManager.reply(ctx, '🔴 Trader profile not found');
                return;
            }

            const { message, buttons } = await this.buildTraderProfileMessage(traderProfile);
            const markup = BotManager.buildInlineKeyboard(buttons);
            await BotManager.reply(ctx, message, {
                reply_markup: markup,
                parse_mode: 'HTML',
            });
        }
        else if (buttonId && buttonId.startsWith('trader_profiles|edit_name')){
            const profileId = buttonId.split('|')[2];
            await BotManager.reply(ctx, 'TODO: edit profile\' name ' + profileId);
        }
        else if (buttonId && buttonId.startsWith('trader_profiles|delete')){
            const parts = buttonId.split('|');
            const profileId = parts[2];
            let confirm: boolean | undefined = undefined; 
            if (parts.length > 3){
                if (parts[3] == 'yes'){
                    confirm = true;
                }
                else if (parts[3] == 'no'){
                    confirm = false;
                }
            }

            if (confirm == undefined){
                const traderProfile = await TraderProfilesManager.getUserTraderProfile(user.id, profileId);
                // ask for confirmation
                await BotManager.reply(ctx, `Are you sure you want to delete <b>${traderProfile?.title}</b> trading profile? It will remove all access to this wallet. This action cannot be undone. Are you sure you want to proceed?`, {
                    parse_mode: 'HTML',
                    reply_markup: BotManager.buildInlineKeyboard([
                        { id: `trader_profiles|delete|${profileId}|yes`, text: 'Yes' },
                        { id: `trader_profiles|delete|${profileId}|no`, text: 'No' },
                    ]),
                });
            }
            else if (confirm == true){
                await TraderProfilesManager.deactivateTraderProfile(profileId, user.id);
                await BotManager.deleteMessage(ctx);
            }
            else {
                // delete this message
                await BotManager.deleteMessage(ctx);
            }
        }
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
                let traderProfiles = await TraderProfilesManager.getUserTraderProfiles(user.id, SwapManager.kNativeEngineId);
                const buttons: InlineButton[] = [];
                for (const traderProfile of traderProfiles){
                    if (buttons.length > 0){
                        buttons.push({ id: 'row', text: '' });
                    }
                    buttons.push({ id: `trader_profiles|make_default|${traderProfile.id}|select`, text: `${traderProfile.default?'⭐️ ':''}${traderProfile.title}` });
                }
                const markup = BotManager.buildInlineKeyboard(buttons);
                await BotManager.updateMessageReplyMarkup(ctx, markup);
            }
        }
        else {
            let traderProfiles = await TraderProfilesManager.getUserTraderProfiles(user.id, SwapManager.kNativeEngineId);
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

                    replyMessage.buttons.push({ id: 'choose_profile', text: '⭐️ Choose profile' });
                }

                for (let index = 0; index < traderProfiles.length; index++) {
                    const traderProfile = traderProfiles[index];
                    
                    const { message, buttons } = await this.buildTraderProfileMessage(traderProfile);   
                    replyMessage.text += `\n\n---\n\n${message}`;

                    replyMessage.buttons.push({ id: 'row', text: '' });
                    replyMessage.buttons.push({
                        id: `trader_profiles|show|${traderProfile.id}`,
                        text: `✏️ ${traderProfile.title}`,
                    });
                }



                replyMessage.markup = BotManager.buildInlineKeyboard(replyMessage.buttons);
            }

            await super.commandReceived(ctx, user, replyMessage);
        }
    }

    async buildTraderProfileMessage(traderProfile: IUserTraderProfile): Promise<{ message: string, buttons: InlineButton[] }> {
        let message = `<b>${traderProfile.title}</b>` + (traderProfile.default ? ' ⭐️' : '');
        message += `\n<code>${traderProfile.wallet?.publicKey}</code> (Tap to copy)`; 
        message += `\nBalance: <b>0 SOL</b>`;

        const buttons: InlineButton[] = [];
        // buttons.push({ id: `trader_profiles|edit|${traderProfile.id}`, text: '✏️ Edit' });
        buttons.push({ id: `trader_profiles|portfolio|${traderProfile.id}`, text: '🎨 Portfolio' });
        buttons.push({ id: `trader_profiles|refresh|${traderProfile.id}`, text: '↻ Refresh' });
        buttons.push({ id: `trader_profiles|make_default|${traderProfile.id}`, text: '⭐️ Make default' });    
        buttons.push({ id: 'row', text: '' });
        buttons.push({ id: `trader_profiles|edit_name|${traderProfile.id}`, text: '✍️ Edit name' });
        buttons.push({ id: `trader_profiles|export|${traderProfile.id}`, text: '📤 Export' });
        buttons.push({ id: `trader_profiles|delete|${traderProfile.id}`, text: '❌ Delete' });


        return { message, buttons };
    }

}