import { Context } from "grammy";
import { IUser, User, UserBotStatus } from "../../../entities/users/User";
import { UserRefClaim } from "../../../entities/users/UserRefClaim";
import { LogManager } from "../../LogManager";
import { BotManager } from "../BotManager";
import { BotHelper, Message } from "./BotHelper";
import { InlineButton, TgMessage } from "../BotTypes";

export class BotStartHelper extends BotHelper {

    constructor() {
        LogManager.log('BotStartHelper', 'constructor');

        const buttons: InlineButton[] = [
            {id: 'add_wallet', text: '➕ Add wallet'},
            {id: 'my_wallets', text: '👀 My wallets'},
            {id: 'row', text: ''},
            {id: 'trader_profiles', text: '💰 Trader profiles'},
            {id: 'row', text: ''},
            {id: 'connect_email', text: '✉️ Connect email'},
            {id: 'referral_program', text: '🎁 Referrals'},
            {id: 'row', text: ''},
            {id: 'upgrade', text: '👑 Upgrade'},
            {id: 'settings', text: '⚙️ Settings'},
        ];

        const replyMessage: Message = {
            photo: 'https://light.dangervalley.com/static/telegram/start.png',
            text: '🚀 Light - real-time Solana wallet tracker.\n' + 
            '\n' +
            'This bot will help you to track your Solana wallets in real-time.\n' +
            '\n' +
            'Commands:\n' +
            '/add_wallet - add a new wallet\n' +
            '/remove_wallet - remove a wallet\n' +
            '/my_wallets - list of your wallets\n' +
            '/help - help\n' +
            '\n' +
            'I have a mobile app, so if you want to use it, please download it from the <a href="https://apps.apple.com/app/id6739495155">AppStore</a> or <a href="https://play.google.com/store/apps/details?id=app.light.bot">Google Play</a>.\n' +
            '\n' +
            'If you want to use the same account in mobile app and Telegram bot, connect email address here, and you\'ll be able to login in mobile app with the same email.\n',
            buttons: buttons,
            markup: BotManager.buildInlineKeyboard(buttons),
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
        let shouldSendStartMessage = true;

        if (paramsString){
            let params = paramsString.split('-');
            
            while (params.length > 1){
                const key = params.shift();
                const value = params.shift();

                if (key == 'r'){
                    referralCode = value;
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
            }
    
        }

        const userTelegramId = ctx.update.message?.from.id;
        LogManager.log('BotStartHelper', 'start', 'userTelegramId:', userTelegramId, 'referralCode:', referralCode);

        if (!user.referralCode && referralCode){
            user.referralCode = referralCode;

            await User.updateOne({ _id: user._id }, {
                $set: {
                    referralCode: user.referralCode,
                }
            });

            await UserRefClaim.create({
                userId: user.id,
                referralCode: referralCode,
                claimedAt: new Date()
            });
        }

        console.log('BotStartHelper', 'start', 'user:', user.id, 'botUsername:', botUsername, 'user.bots:', user.bots);

        if (botUsername && (!user.bots || !user.bots[botUsername] || user.bots[botUsername] == UserBotStatus.BLOCKED)){
            user.bots = user.bots || {};
            user.bots[botUsername] = UserBotStatus.ACTIVE;
            user.defaultBot = botUsername;
            BotManager.defaultBots[user.id] = botUsername;

            await User.updateOne({ _id: user._id }, {
                $set: {
                    bots: user.bots,
                    defaultBot: user.defaultBot,
                }
            });
        }

        if (shouldSendStartMessage){
            await super.commandReceived(ctx, user);
        }

        if (mint){
            await BotManager.tryToSendTokenInfo(ctx, mint, user);
        }

        if (!shouldSendStartMessage){
            await BotManager.deleteMessage(ctx);
        }
    }

    async messageReceived(message: TgMessage, ctx: Context, user: IUser): Promise<boolean> {
        LogManager.log('BotStartHelper', 'messageReceived', message.text);
        return await super.messageReceived(message, ctx, user);
    }

}