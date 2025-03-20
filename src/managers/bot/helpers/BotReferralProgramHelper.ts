import { Context } from "grammy";
import { LogManager } from "../../LogManager";
import { BotHelper, Message } from "./BotHelper";
import { IUser } from "../../../entities/users/User";

export class BotReferralProgramHelper extends BotHelper {

    constructor() {
        LogManager.log('BotReferralProgramHelper', 'constructor');
        const replyMessage: Message = { text: '⏰ Referral program is coming very soon' };
        super('referral_program', replyMessage);
    }

    async commandReceived(ctx: Context, user: IUser) {
        await super.commandReceived(ctx, user);
    }

}