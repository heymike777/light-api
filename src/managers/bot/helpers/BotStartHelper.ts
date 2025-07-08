import { Context } from "grammy";
import { IUser, User, UserBotStatus } from "../../../entities/users/User";
import { LogManager } from "../../LogManager";
import { BotManager } from "../BotManager";
import { BotHelper, Message } from "./BotHelper";
import { InlineButton, TgMessage } from "../BotTypes";
import { TraderProfilesManager } from "../../TraderProfilesManager";
import { UserUtm } from "../../../entities/users/UserUtm";
import { WalletManager } from "../../WalletManager";
import { PremiumError } from "../../../errors/PremiumError";
import { IWallet } from "../../../entities/Wallet";
import { Helpers } from "../../../services/helpers/Helpers";
import { ReferralsManager } from "../../ReferralsManager";
import { ChainManager } from "../../chains/ChainManager";
import { Chain } from "../../../services/solana/types";

export class BotStartHelper extends BotHelper {

    constructor() {
        LogManager.log('BotStartHelper', 'constructor');
        
        const replyMessage: Message = {
            text: '🚀 Light - real-time Solana wallet tracker and Trading Engine.'
        };

        super('start', replyMessage);
    }

    async commandReceived(ctx: Context, user: IUser) {      
        let paramsString: string | undefined = ctx?.update?.message?.text;

        if (paramsString){
            paramsString = paramsString.replace('/start', '');
            paramsString = paramsString.trim();
        }

        LogManager.log('BotStartHelper', 'start', 'params:', paramsString);

        const botUsername = ctx.me?.username;
        let referralCode: string | undefined = undefined;
        let mint: string | undefined = undefined;
        let utm: string | undefined = undefined;
        let trackWallet: string | undefined = undefined;
        let trackWalletTitle: string | undefined = undefined;
        let shouldSendStartMessage = true;
        let chainString: string | undefined = undefined;

        if (paramsString){
            let params = paramsString.split('-');
            
            while (params.length > 1){
                const key = params.shift();
                const value = params.shift();

                if (key == 'r'){
                    referralCode = value;
                }
                else if (key == 'c'){
                    chainString = value;
                }
                else if (key == 'ca'){
                    mint = value;

                    // if this user already have messages - don't send start message
                    if (user?.bots && user.bots[botUsername]){
                        shouldSendStartMessage = false;
                    }
                }
                else if (key == 'sell'){
                    mint = value;
                    shouldSendStartMessage = false;
                }
                else if (key == 'utm'){
                    utm = value;
                }
                else if (key == 'w'){
                    trackWallet = value;
                }
                else if (key == 'wt'){
                    trackWalletTitle = value;
                }
            }
    
        }

        if (chainString){
            console.log('BotStartHelper', 'start', 'chainString:', chainString);
            chainString = chainString.toLowerCase();
            if (chainString == 'soonbase') { chainString = Chain.SOONBASE_MAINNET; }
            if (chainString == 'solana') { chainString = Chain.SOLANA; }
            const chain = chainString as Chain;

            user.defaultChain = chain;
        }

        const userTelegramId = ctx.update.message?.from.id;
        LogManager.log('BotStartHelper', 'start', 'userTelegramId:', userTelegramId, 'referralCode:', referralCode);

        if (referralCode){
            await ReferralsManager.claimRefCode(user, referralCode, false);
        }

        user.bots = user.bots || {};
        user.bots[botUsername] = UserBotStatus.ACTIVE;
        user.defaultBot = botUsername;
        BotManager.defaultBots[user.id] = botUsername;

        await User.updateOne({ _id: user._id }, {
            $set: {
                bots: user.bots,
                defaultBot: user.defaultBot,
                defaultChain: user.defaultChain,
            }
        });

        if (shouldSendStartMessage){
            const replyMessage = await this.generateReplyMessage(user);
            await super.commandReceived(ctx, user, replyMessage);
        }

        if (mint){
            await BotManager.tryToSendTokenInfo(ctx, mint, user);
        }

        if (!shouldSendStartMessage){
            await BotManager.deleteMessage(ctx);
        }

        if (utm){
            const item = new UserUtm();
            item.userId = user.id;
            item.utm = utm;
            item.createdAt = new Date();
            await item.save();

            //TODO: save it to Mixpanel to User somehow (should have array of UTMs there)
        }

        if (trackWallet){
            let wallet: IWallet | undefined = undefined;
            try {
                wallet = await WalletManager.addWallet(ctx.chat?.id || -1, user, trackWallet, trackWalletTitle);
            }
            catch (err){
                if (err instanceof PremiumError){
                    await BotManager.reply(ctx, err.message);
                }
            }
    
            if (wallet){
                await BotManager.reply(ctx, `${trackWalletTitle || Helpers.prettyWallet(trackWallet)} wallet saved! We will start tracking it within a minute.`);
            }
        }
    }

    async messageReceived(message: TgMessage, ctx: Context, user: IUser): Promise<boolean> {
        LogManager.log('BotStartHelper', 'messageReceived', message.text);
        return await super.messageReceived(message, ctx, user);
    }

    async generateReplyMessage(user?: IUser): Promise<Message> {
        const trader = await TraderProfilesManager.getUserDefaultTraderProfile(user?.id);

        const buttons: InlineButton[] = [
            {id: 'add_wallet', text: '➕ Add wallet'},
            {id: 'my_wallets', text: '👀 My wallets'},
            {id: 'row', text: ''},
            {id: 'trader_profiles', text: '💰 Trader profiles'},
            {id: 'portfolio', text: '💼 Portfolio'},
            {id: 'row', text: ''},
            // {id: 'connect_email', text: '✉️ Connect email'},
            {id: 'upgrade', text: '👑 Upgrade'},
            {id: 'referral_program', text: '👥 Refer friends'},
            {id: 'settings|chain', text: '🌐 '+ ChainManager.getChainTitle(user?.defaultChain || Chain.SOLANA)},
            {id: 'row', text: ''}, 
            {id: 'tokens|hot', text: '🔥 Hot tokens'},
            {id: 'airdrops', text: '🪂 Airdrops'},
            {id: 'settings', text: '⚙️ Settings'},
            {id: 'row', text: ''}, 
            {id: 'farm', text: '⛏️ Pump farm'}, 
            // {id: 'events', text: '🏆 SOON RUSH'},
        ];

        const replyMessage: Message = {
            photo: 'https://light.dangervalley.com/static/telegram/start3.png',
            text: '🚀 Light - trading engine on Solana.\n' + 
            '\n' +

            (trader?.encryptedWallet ? '<b>Your main trader profile:</b> <code>' + trader.encryptedWallet.publicKey + '</code> (Tap to copy)\n\n' : '') +

            '<b>Commands:</b>\n' +
            '/add_wallet - track a new wallet in real-time\n' +
            '/remove_wallet - remove a wallet from tracking\n' +
            '/my_wallets - list of your wallets\n' +
            '/trader_profiles - your trader wallets\n' +
            '/buy - buy tokens\n' +
            '/sell - sell tokens\n' +
            '/airdrops - track airdrop allocation\n' +
            '\n' +
            'We support <b>Solana</b> and <b>Sonic SVM</b>. You can select your network in /settings \n',
            // '\n' +
            // '<b>Light mobile app:</b> <a href="https://apps.apple.com/app/id6739495155">AppStore</a> or <a href="https://play.google.com/store/apps/details?id=app.light.bot">Google Play</a>.\n' +
            // '\n' +
            // 'If you want to use the same account in mobile app and Telegram bot, connect email address here, and you\'ll be able to login in mobile app with the same email.\n'
            buttons: buttons,
            markup: BotManager.buildInlineKeyboard(buttons),
        };

        return replyMessage;

    }

}