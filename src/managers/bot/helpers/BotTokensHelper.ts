import { Context } from "grammy";
import { IUser } from "../../../entities/users/User";
import { LogManager } from "../../LogManager";
import { BotManager } from "../BotManager";
import { BotHelper, Message } from "./BotHelper";
import { ChainManager } from "../../chains/ChainManager";
import { Chain } from "../../../services/solana/types";
import { TokenManager } from "../../TokenManager";
import { Helpers } from "../../../services/helpers/Helpers";
import { InlineButton } from "../BotTypes";

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
                const chainName = ChainManager.getChainTitle(chain);
                let text = `🔥 Hot tokens on ${chainName}`;

                const buttons: InlineButton[] = [];

                let index = 0;
                for (const token of tokens) {
                    text += `\n\n<b>${token.symbol}</b>`;
                    text += `\nCA: <code>${token.mint}</code>`;
                    if (token.volume?.["24h"]){
                        text += `\nVOL (24h): $${Helpers.numberWithCommas(Math.round(token.volume["24h"]))}`;
                    }

                    if (index % 3 == 0) { buttons.push({ id: 'row', text: '' }); }
                    buttons.push({ id: `tokens|${token.mint}`, text: (token.isFeatured?'🔥 ':'') + `BUY ${token.symbol}` });
                    index++;
                }

                const markup = BotManager.buildInlineKeyboard(buttons);
                await BotManager.reply(ctx, text, { reply_markup: markup });

            }
            else {
                await BotManager.reply(ctx, 'No hot tokens found.');
            }
        }
        else if (buttonId && buttonId.startsWith('tokens|')){
            const parts = buttonId.split('|');
            if (parts.length == 2) {
                const mint = parts[1];
                await BotManager.tryToSendTokenInfo(ctx, mint, user)             
            }
        }

    }

}