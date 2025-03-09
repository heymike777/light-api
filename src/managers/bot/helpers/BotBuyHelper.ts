import { BotHelper, Message } from "./BotHelper";

export class BotBuyHelper extends BotHelper {

    constructor() {
        const replyMessage: Message = {
            text: 'Enter a token symbol or address to buy'
        };

        super('buy', replyMessage);
    }

}