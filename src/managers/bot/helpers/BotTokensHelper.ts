import { Context } from "grammy";
import { IUser } from "../../../entities/users/User";
import { LogManager } from "../../LogManager";
import { BotManager } from "../BotManager";
import { BotHelper, Message } from "./BotHelper";
import { ChainManager } from "../../chains/ChainManager";
import { Chain } from "../../../services/solana/types";
import { TokenManager } from "../../TokenManager";

export class BotTokensHelper extends BotHelper {

    constructor() {
        LogManager.log('BotTokensHelper', 'constructor');

        const replyMessage: Message = {
            text: 'Tokens'
        };

        super('tokens', replyMessage);
    }

    async commandReceived(ctx: Context, user: IUser) {
        const chain = user.defaultChain || Chain.SOLANA;
        const buttonId = ctx.update?.callback_query?.data;

        // if (ctx?.update?.message?.text == '/buy' || buttonId == 'buy'){
        //     return await super.commandReceived(ctx, user);
        // }
        // else 
        if (buttonId && buttonId.startsWith('tokens|hot')){
            const tokens = await TokenManager.getHotTokens(chain);
            if (tokens.length > 0) {
                let text = '🔥 Hot tokens';
                await BotManager.reply(ctx, text);
            }
            else {
                await BotManager.reply(ctx, 'No hot tokens found.');
            }
        }

    }

}