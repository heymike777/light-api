import { Context } from "grammy";
import { IUser, User, UserBotStatus } from "../../../entities/users/User";
import { UserRefClaim } from "../../../entities/users/UserRefClaim";
import { LogManager } from "../../LogManager";
import { BotManager, InlineButton, TgMessage } from "../BotManager";
import { BotHelper, Message } from "./BotHelper";

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
            {id: 'upgrade', text: '🚀 Upgrade'},
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
        let referralCode: string | undefined = ctx?.update?.message?.text;
        if (referralCode){
            referralCode = referralCode.replace('/start', '');
            referralCode = referralCode.trim();
        }
        if (!referralCode) {
            referralCode = 'default';
        }

        const userTelegramId = ctx.update.message?.from.id;
        LogManager.log('BotStartHelper', 'start', 'userTelegramId:', userTelegramId, 'referralCode:', referralCode);

        if (!user.referralCode){
            user.referralCode = referralCode;

            await User.updateOne({ _id: user._id }, {
                $set: {
                    referralCode: user.referralCode,
                }
            });

        }

        const botUsername = ctx.me?.username;
        if (botUsername && (!user.bots || !user.bots[botUsername] || user.bots[botUsername] == UserBotStatus.BLOCKED)){
            user.bots = user.bots || {};
            user.bots[botUsername] = UserBotStatus.ACTIVE;
            if (!user.defaultBot){
                user.defaultBot = botUsername;
            }

            await User.updateOne({ _id: user._id }, {
                $set: {
                    bots: user.bots,
                    defaultBot: user.defaultBot,
                }
            });
        }

        if (referralCode != 'default'){
            await UserRefClaim.create({
                userId: user.id,
                referralCode: referralCode,
                claimedAt: new Date()
            });
        }


        super.commandReceived(ctx, user);
    }

    async messageReceived(message: TgMessage, ctx: Context, user: IUser): Promise<boolean> {
        LogManager.log('BotStartHelper', 'messageReceived', message.text, 'ctx.match:', ctx.match);

        super.messageReceived(message, ctx, user);
        return false;
    }



}