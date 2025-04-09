import { Context } from "grammy";
import { LogManager } from "../../LogManager";
import { BotManager } from "../BotManager";
import { BotHelper, Message } from "./BotHelper";
import { IUser, TelegramWaitingType, User } from "../../../entities/users/User";
import { UserManager } from "../../UserManager";
import { TraderProfilesManager } from "../../TraderProfilesManager";
import { SwapManager } from "../../SwapManager";
import { IUserTraderProfile, UserTraderProfile } from "../../../entities/users/TraderProfile";
import { CustomError } from "../../../errors/CustomError";
import { parse } from "path";
import { newConnection, newConnectionByChain } from "../../../services/solana/lib/solana";
import { SolanaManager } from "../../../services/solana/SolanaManager";
import { InlineButton, TgMessage } from "../BotTypes";
import { Chain, Priority } from "../../../services/solana/types";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import * as web3 from '@solana/web3.js';

export class BotTraderProfilesHelper extends BotHelper {

    constructor() {
        LogManager.log('BotTraderProfilesHelper', 'constructor');

        const buttons: InlineButton[] = [
            {id: 'trader_profiles|create', text: '➕ Add profile'},
            {id: 'trader_profiles|import', text: '⬇️ Import profile'},
            {id: 'row', text: ''},
            {id: `trader_profiles|refresh`, text: '↻ Refresh'},
        ];

        const replyMessage: Message = {
            text: 'Trader profiles',
            buttons: buttons,
            markup: BotManager.buildInlineKeyboard(buttons),
        };

        super('trader_profiles', replyMessage, ['choose_trader', 'portfolio', 'traders']);
    }

    async commandReceived(ctx: Context, user: IUser) {
        await UserManager.updateTelegramState(user.id, undefined);

        let buttonId = ctx.update?.callback_query?.data;
        const botUsername = BotManager.getBotUsername(ctx);

        if (buttonId && buttonId.startsWith('traders|')){
            // this is a fix for the old buttonId. we can remove it later
            buttonId = buttonId.replace('traders|', 'trader_profiles|');
        }

        if (ctx?.update?.message?.text == '/choose_trader' || buttonId == 'choose_trader'){
            let traderProfiles = await TraderProfilesManager.getUserTraderProfiles(user.id, SwapManager.kNativeEngineId);

            const buttons: InlineButton[] = [];
            for (const traderProfile of traderProfiles){
                if (buttons.length > 0){
                    buttons.push({ id: 'row', text: '' });
                }
                buttons.push({ id: `trader_profiles|make_main|${traderProfile.id}|select`, text: `${traderProfile.default?'⭐️ ':''}${traderProfile.title}` });
            }

            const markup = BotManager.buildInlineKeyboard(buttons);

            await BotManager.reply(ctx, 'Choose your main trader profile', {
                reply_markup: markup,
                parse_mode: 'HTML',
            });
        }
        else if (ctx?.update?.message?.text == '/portfolio' || buttonId == 'portfolio' || (buttonId && buttonId.startsWith('trader_profiles|portfolio'))){
            let traderProfileId: string | undefined;
            let isRefresh = false;
            if (buttonId && buttonId.startsWith('trader_profiles|portfolio')){
                const parts = buttonId.split('|');
                if (parts.length>2){
                    traderProfileId = parts[2];
                }
                if (parts.length>3 && parts[3] == 'refresh'){
                    isRefresh = true;
                }
            }

            let traderProfile: IUserTraderProfile | undefined;
            if (traderProfileId){
                traderProfile = await TraderProfilesManager.getUserTraderProfile(user.id, traderProfileId);
            }
            else {
                traderProfile = await TraderProfilesManager.getUserDefaultTraderProfile(user.id);
            }

            if (!traderProfile){
                await BotManager.reply(ctx, '🔴 Trader profile not found');
                return;
            }

            const { message } = await BotManager.buildPortfolioMessage(user, traderProfile, botUsername);

            if (isRefresh){
                const markup = BotManager.buildInlineKeyboard([
                    { id: `trader_profiles|portfolio|${traderProfileId}|refresh`, text: '↻ Refresh' },
                ]);
                await BotManager.editMessage(ctx, message, markup);
            }
            else {
                await BotManager.reply(ctx, message, {
                    parse_mode: 'HTML',
                    reply_markup: BotManager.buildInlineKeyboard([
                        { id: `trader_profiles|portfolio|${traderProfile.id}|refresh`, text: '↻ Refresh' },
                    ]),
                });    
            }
        }
        else if (buttonId && buttonId == 'trader_profiles|create'){
            const countAll = await UserTraderProfile.countDocuments({ userId: user.id });
            const engineId = SwapManager.kNativeEngineId;
            const title = `Wallet ${countAll+1}`;
            const defaultAmount = 0.25;
            const slippage = 10;

            try {
                const traderProfile = await TraderProfilesManager.createTraderProfile(user, engineId, title, Priority.MEDIUM, defaultAmount, slippage, undefined);

                const { message, buttons } = await this.buildTraderProfileMessage(traderProfile, 0);
                const markup = BotManager.buildInlineKeyboard(buttons);
                await BotManager.reply(ctx, message, {
                    reply_markup: markup,
                    parse_mode: 'HTML',
                });
            }
            catch (e: any){
                LogManager.error('e:', e);
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

            const chain = Chain.SOLANA; //TODO: get for other chains as well
            const connection = newConnectionByChain(chain);
            const balance = await SolanaManager.getWalletSolBalance(connection, traderProfile.encryptedWallet?.publicKey);

            const { message, buttons } = await this.buildTraderProfileMessage(traderProfile, balance?.uiAmount);
            const markup = BotManager.buildInlineKeyboard(buttons);
            await BotManager.reply(ctx, message, {
                reply_markup: markup,
                parse_mode: 'HTML',
            });
        }
        else if (buttonId && buttonId.startsWith('trader_profiles|edit_name')){
            const profileId = buttonId.split('|')[2];
            await BotManager.reply(ctx, 'Enter the new name for this trader profile');

            await UserManager.updateTelegramState(user.id, {waitingFor: TelegramWaitingType.TRADER_PROFILE_EDIT_NAME, data: {profileId}, helper: this.kCommand});
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
                await BotManager.reply(ctx, `Are you sure you want to delete <b>${traderProfile?.title}</b> trader profile? It will remove all access to this wallet. This action cannot be undone. Are you sure you want to proceed?`, {
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
        else if (buttonId && buttonId.startsWith('trader_profiles|export')){
            const parts = buttonId.split('|');
            const profileId = parts[2];

            const traderProfile = await TraderProfilesManager.getUserTraderProfile(user.id, profileId);
            if (traderProfile){
                const tpWallet = traderProfile.getWallet();
                await BotManager.reply(ctx, `<b>${traderProfile.title}</b>${traderProfile.default?' ⭐️':''}\n\nPublic key:\n<code>${tpWallet?.publicKey}</code> (Tap to copy)\n\nPrivate key:\n<code>${tpWallet?.privateKey}</code> (Tap to copy)\n\nYou can import the private key to any Solana wallet. Don't share it with anyone.`, {
                    parse_mode: 'HTML',
                    reply_markup: BotManager.buildInlineKeyboard([
                        { id: `delete_message`, text: 'Hide' },
                    ]),
                });    
            }
        }
        else if (buttonId && buttonId.startsWith('trader_profiles|portfolio')){
            const profileId = buttonId.split('|')[2];
            await BotManager.reply(ctx, 'TODO: portfolio of profile ' + profileId);
        }
        else if (buttonId && buttonId.startsWith('trader_profiles|refresh')){
            const parts = buttonId.split('|');
            const profileId = parts.length>2 ? parts[2] : undefined;

            if (profileId){
                //TODO: update one profile
                const replyMessage = await this.buildReplyMessageForUserTraderProfile(user.id, profileId);
                if (replyMessage){
                    await BotManager.editMessage(ctx, replyMessage.text, replyMessage.markup);
                }
                else {
                    await BotManager.editMessage(ctx, `Trader profile not found`, undefined);
                }
            }
            else {
                // update all profiles
                const replyMessage = await this.buildReplyMessageForUserTraderProfiles(user.id);
                await BotManager.editMessage(ctx, replyMessage.text, replyMessage.markup);
            }
        }
        else if (buttonId && buttonId.startsWith('trader_profiles|make_main')){
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
                    buttons.push({ id: `trader_profiles|make_main|${traderProfile.id}|select`, text: `${traderProfile.default?'⭐️ ':''}${traderProfile.title}` });
                }
                const markup = BotManager.buildInlineKeyboard(buttons);
                await BotManager.editMessageReplyMarkup(ctx, markup);
            }
        }
        else if (buttonId && buttonId.startsWith('trader_profiles|import')){
            await UserManager.updateTelegramState(user.id, {waitingFor: TelegramWaitingType.TRADER_PROFILE_IMPORT_NAME, helper: this.kCommand});
            const replyMessage: Message = {
                text: 'What would you like to name this trader profile?',
            }
            await super.commandReceived(ctx, user, replyMessage);
        }
        else {
            const replyMessage = await this.buildReplyMessageForUserTraderProfiles(user.id);
            await super.commandReceived(ctx, user, replyMessage);
        }
    }

    async buildTraderProfileMessage(traderProfile: IUserTraderProfile, solBalance?: number): Promise<{ message: string, buttons: InlineButton[] }> {
        let message = `<b>${traderProfile.title}</b>` + (traderProfile.default ? ' ⭐️' : '');
        message += `\n<code>${traderProfile.encryptedWallet?.publicKey}</code> (Tap to copy)`; 
        if (solBalance !== undefined){
            message += `\nBalance: <b>${solBalance} SOL</b>`;
        }

        const buttons: InlineButton[] = [];
        buttons.push({ id: `trader_profiles|portfolio|${traderProfile.id}`, text: '🎨 Portfolio' });
        buttons.push({ id: `trader_profiles|refresh|${traderProfile.id}`, text: '↻ Refresh' });
        buttons.push({ id: `trader_profiles|make_main|${traderProfile.id}`, text: '⭐️ Make main' });    
        buttons.push({ id: 'row', text: '' });
        buttons.push({ id: `trader_profiles|edit_name|${traderProfile.id}`, text: '✍️ Edit name' });
        buttons.push({ id: `trader_profiles|export|${traderProfile.id}`, text: '📤 Export' });
        buttons.push({ id: `trader_profiles|delete|${traderProfile.id}`, text: '❌ Delete' });

        return { message, buttons };
    }

    async buildReplyMessageForUserTraderProfile(userId: string, profileId: string): Promise<Message | undefined> {
        let traderProfile = await TraderProfilesManager.getUserTraderProfile(userId, profileId);
        if (!traderProfile){
            return undefined;
        }

        const chain = Chain.SOLANA; //TODO: get for other chains as well
        const connection = newConnectionByChain(chain);
        const balance = await SolanaManager.getWalletSolBalance(connection, traderProfile.encryptedWallet?.publicKey);

        const { message, buttons } = await this.buildTraderProfileMessage(traderProfile, balance?.uiAmount);
        const markup = BotManager.buildInlineKeyboard(buttons);

        return { text: message, markup };
    }

    async buildReplyMessageForUserTraderProfiles(userId: string): Promise<Message> {
        let traderProfiles = await TraderProfilesManager.getUserTraderProfiles(userId, SwapManager.kNativeEngineId);
        const replyMessage = this.getReplyMessage();
                    
        if (traderProfiles.length == 0){
            replyMessage.text += 'You don\'t have any trader profiles yet. You have to create one to start trading.\n\nYou can create multiple trader profiles, if you want to use different strategies. For each trader profile you\'ll have a separate wallet, trading history, and portfolio.';
        }
        else {
            const defaultProfile = traderProfiles.find(tp => tp.default) || traderProfiles[0];

            const chain = Chain.SOLANA; //TODO: get for other chains as well
            const connection = newConnectionByChain(chain);
            const walletAddresses = traderProfiles.map(tp => tp.encryptedWallet?.publicKey).filter(Boolean) as string[];
            const balances = await SolanaManager.getWalletsSolBalances(connection, walletAddresses);
    
            replyMessage.buttons = replyMessage.buttons || [];
            replyMessage.text = `You have ${traderProfiles.length} trader profile${ traderProfiles.length==1?'':'s' }.`;
            replyMessage.text += `\n\nYou can create multiple trader profiles, if you want to use different strategies. For each trader profile you'll have a separate wallet, trading history, and portfolio.`;

            if (traderProfiles.length > 1){
                replyMessage.text += `\n\nYour current main trader profile is <b>${defaultProfile.title}</b>. It will be used in all trading operations. You can change it at any time - /choose_trader.`;

                replyMessage.buttons.push({ id: 'choose_trader', text: '⭐️ Pick main' });
            }

            for (let index = 0; index < traderProfiles.length; index++) {
                const traderProfile = traderProfiles[index];
                const solBalance = balances.find(b => b.publicKey == traderProfile.encryptedWallet?.publicKey)?.uiAmount || 0;
                const { message, buttons } = await this.buildTraderProfileMessage(traderProfile, solBalance);   
                replyMessage.text += `\n\n---\n\n${message}`;

                replyMessage.buttons.push({ id: 'row', text: '' });
                replyMessage.buttons.push({
                    id: `trader_profiles|show|${traderProfile.id}`,
                    text: `✏️ ${traderProfile.title}`,
                });
            }



            replyMessage.markup = BotManager.buildInlineKeyboard(replyMessage.buttons);
        }
        return replyMessage;

    }

    async messageReceived(message: TgMessage, ctx: Context, user: IUser): Promise<boolean> {
        LogManager.log('BotTradingProfilesHelper', 'messageReceived', message.text);

        super.messageReceived(message, ctx, user);

        if (user.telegramState?.waitingFor == TelegramWaitingType.TRADER_PROFILE_EDIT_NAME){
            const title = message.text.trim();

            const profileId = user.telegramState.data.profileId;
            const updated = await UserTraderProfile.updateOne({ userId: user.id, _id: profileId }, { $set: { title: title } });
            if (updated.modifiedCount == 1){
                await BotManager.reply(ctx, `Trader updated ✅`);
            }
            else {
                await BotManager.reply(ctx, `Trader profile not found`);
            }

            await UserManager.updateTelegramState(user.id, undefined);
            return true;
        }
        else if (user.telegramState?.waitingFor == TelegramWaitingType.TRADER_PROFILE_IMPORT_NAME){
            const title = message.text.trim();

            await UserManager.updateTelegramState(user.id, {waitingFor: TelegramWaitingType.TRADER_PROFILE_IMPORT_PRIVATE_KEY, helper: this.kCommand, data: {title}});
            await BotManager.reply(ctx, 'Please, send your private key');
            return true;
        }
        else if (user.telegramState?.waitingFor == TelegramWaitingType.TRADER_PROFILE_IMPORT_PRIVATE_KEY){
            const privateKeyString = message.text.trim();
            let privateKey: Uint8Array | undefined = undefined;

            try {
                if (privateKeyString.startsWith('[') == false){
                    privateKey = bs58.decode(privateKeyString);
                }
                else {
                    // this is a solflare format
                    const parts = privateKeyString.substring(1, privateKeyString.length-1).split(',');
                    privateKey = new Uint8Array(parts.map(p => parseInt(p)));
                }
            }
            catch (e: any){
                LogManager.error('e:', e);
            }

            if (!privateKey){
                await BotManager.reply(ctx, '🔴 Invalid private key. Please, try again.');
                return true;
            }

            let keypair: web3.Keypair | undefined;
            try {
                keypair = web3.Keypair.fromSecretKey(privateKey);
            }
            catch (e: any){
                LogManager.error('e:', e);
                await BotManager.reply(ctx, '🔴 Invalid private key. Please, try again.');
                return true;
            }

            const wallet = {
                publicKey: keypair.publicKey.toString(),
                privateKey: bs58.encode(keypair.secretKey),
            };

            try {
                const title = user.telegramState?.data?.title || 'Imported wallet';
                await TraderProfilesManager.createTraderProfile(user, SwapManager.kNativeEngineId, title, Priority.MEDIUM, undefined, undefined, undefined, wallet);
                await BotManager.reply(ctx, `Trader profile imported ✅`);
                await UserManager.updateTelegramState(user.id, undefined);
            }
            catch (e: any){
                LogManager.error('e:', e);
                if (e.statusCode == 444){
                    // premium error
                    await BotManager.replyWithPremiumError(ctx, e.message);
                }
                else {
                    await BotManager.reply(ctx, e.message);
                }
            }
            
            return true;
        }

        return false;
    }

}