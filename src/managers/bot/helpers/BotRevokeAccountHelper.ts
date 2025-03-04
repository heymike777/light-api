import { Context } from "grammy";
import { LogManager } from "../../LogManager";
import { BotManager, InlineButton, TgMessage } from "../BotManager";
import { BotHelper, Message } from "./BotHelper";
import { IUser, TelegramWaitingType, User } from "../../../entities/users/User";
import { UserManager } from "../../UserManager";

export class BotRevokeAccountHelper extends BotHelper {

    constructor() {
        LogManager.log('BotRevokeAccountHelper', 'constructor');

        const buttons: InlineButton[] = [
            {id: 'revoke_account|yes', text: 'Yes, revoke it'},
            {id: 'revoke_account|no', text: 'No, cancel'},
        ];

        const replyMessage: Message = {
            text: 'This command will permanently revoke your account, removing all tracked wallets, transaction history, and trader profiles. This action cannot be undone. Are you sure you want to proceed?',
            buttons: buttons,
            markup: BotManager.buildInlineKeyboard(buttons),
        };

        super('revoke_account', replyMessage);
    }

    async commandReceived(ctx: Context, user: IUser) {
        await UserManager.updateTelegramState(user.id, undefined);

        const buttonId = ctx.update?.callback_query?.data;

        if (buttonId == 'revoke_account|yes'){
            await UserManager.revokeUser(user.id);

            try {
                if (ctx.update?.callback_query?.message?.chat?.id && ctx.update?.callback_query?.message?.message_id){
                    ctx.api.deleteMessage(ctx.update?.callback_query?.message?.chat?.id, ctx.update?.callback_query?.message?.message_id);
                }    
            }
            catch (e: any){}

            ctx.reply('Your account has been revoked ✅\n\nAll your data has been removed. If you want to use the bot again, you need to start over.');
        }
        else if (buttonId == 'revoke_account|no'){
            try {
                if (ctx.update?.callback_query?.message?.chat?.id && ctx.update?.callback_query?.message?.message_id){
                    ctx.api.deleteMessage(ctx.update?.callback_query?.message?.chat?.id, ctx.update?.callback_query?.message?.message_id);
                }    
            }
            catch (e: any){}

        }
        else {
            await super.commandReceived(ctx, user);
        }
    }

}