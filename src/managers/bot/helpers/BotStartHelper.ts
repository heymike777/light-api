import { IUser } from "../../../entities/User";
import { UserRefClaim } from "../../../entities/users/UserRefClaim";
import { LogManager } from "../../LogManager";
import { TgMessage } from "../BotManager";
import { BotHelper, Message } from "./BotHelper";

export class BotStartHelper extends BotHelper {

    constructor() {
        LogManager.log('BotStartHelper', 'constructor');

        const replyMessage: Message = {
            text: 'Hey, I am Nova! I can help you with:\n' + 
            '- wallet tracking\n' + 
            '- tokens trading'
        };

        super('start', replyMessage);
    }

    async commandReceived(ctx: any, user: IUser) {        
        let referralCode: string | undefined = ctx?.update?.message?.text;
        if (referralCode){
            referralCode = referralCode.replace('/start', '');
            referralCode = referralCode.trim();
        }
        if (!referralCode) {
            referralCode = 'default';
        }

        const userTelegramId = ctx.update.message.from.id;
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

    async messageReceived(message: TgMessage, ctx: any){
        LogManager.log('BotStartHelper', 'messageReceived', message.text, 'ctx.match:', ctx.match);

        super.messageReceived(message, ctx);


    }



}