import { TgMessage } from "../BotManager";
import { BotHelper, Message } from "./BotHelper";

export class BotStartHelper extends BotHelper {

    constructor() {
        console.log('BotStartHelper', 'constructor');

        const replyMessage: Message = {
            text: 'Hey, I am Nova! I can help you with:\n' + 
            '- wallet tracker\n' + 
            '- trade tokens\n' +
            '- sniper\n' +
            '- tokens price tracker\n' +
            '- portfolio\n' +
            '- alpha notifications'
        };

        super('start', replyMessage);
    }

    async commandReceived(ctx: any) {        
        let referralCode: string | undefined = ctx?.update?.message?.text;
        if (referralCode){
            referralCode = referralCode.replace('/start', '');
            referralCode = referralCode.trim();
        }
        if (!referralCode) {
            referralCode = 'default';
        }

        const userTelegramId = ctx.update.message.from.id;
        console.log('BotStartHelper', 'start', 'userTelegramId:', userTelegramId, 'referralCode:', referralCode);

        super.commandReceived(ctx);
    }

    async messageReceived(message: TgMessage, ctx: any){
        console.log('BotStartHelper', 'messageReceived', message.text, 'ctx.match:', ctx.match);

        super.messageReceived(message, ctx);


    }



}