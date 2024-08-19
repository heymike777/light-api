import { SolanaManager } from "../../../services/solana/SolanaManager";
import { WalletManager } from "../../WalletManager";
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

    async messageReceived(message: TgMessage, ctx: any){
        console.log('BotStartHelper', 'messageReceived', message.text);

        super.messageReceived(message, ctx);


    }



}