import { Context } from "grammy";
import { IUser } from "../../../entities/users/User";
import { UserRefClaim } from "../../../entities/users/UserRefClaim";
import { LogManager } from "../../LogManager";
import { TgMessage } from "../BotManager";
import { BotHelper, Message } from "./BotHelper";

export class BotStartHelper extends BotHelper {

    constructor() {
        LogManager.log('BotStartHelper', 'constructor');

        const replyMessage: Message = {
            text: '🚀 Light - real-time Solana wallet tracker:\n' + 
            '\n' +
            'This bot will help you to track your Solana wallets in real-time.\n' +
            '\n' +
            'Commands:\n' +
            '/add_wallet - add a new wallet\n' +
            '/remove_wallet - remove a wallet\n' +
            '/my_wallets - list of your wallets\n' +
            '/help - help\n' +
            '\n' +
            'I have a mobile app, so if you want to use it, please download it from the App Store or Google Play.\n' +
            'AppStore: https://apps.apple.com/app/id6739495155\n' +
            'Google Play: https://play.google.com/store/apps/details?id=app.light.bot\n' +
            '\n' +
            'If you want to use the same account in mobile app and Telegram bot, connect email address here, and you\'ll be able to login in mobile app with the same email.\n'
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
            await user.save();
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

    async messageReceived(message: TgMessage, ctx: Context){
        LogManager.log('BotStartHelper', 'messageReceived', message.text, 'ctx.match:', ctx.match);

        super.messageReceived(message, ctx);


    }



}