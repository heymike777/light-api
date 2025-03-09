import { Context } from "grammy";
import { SolanaManager } from "../../../services/solana/SolanaManager";
import { LogManager } from "../../LogManager";
import { WalletManager } from "../../WalletManager";
import { BotManager } from "../BotManager";
import { BotHelper, Message } from "./BotHelper";
import { IUser, TelegramWaitingType } from "../../../entities/users/User";
import { UserManager } from "../../UserManager";
import { TgMessage } from "../BotTypes";

export class BotRemoveWalletHelper extends BotHelper {

    constructor() {
        LogManager.log('BotRemoveWalletHelper', 'constructor');

        const replyMessage: Message = {
            text: 'Send me wallet address to remove. You can also send me multiple wallets (each wallet address on a new line).'
        };

        super('remove_wallet', replyMessage);
    }

    async commandReceived(ctx: Context, user: IUser) {
        await UserManager.updateTelegramState(user.id, { waitingFor: TelegramWaitingType.REMOVE_WALLET, helper: this.kCommand });
        await super.commandReceived(ctx, user);
    }

    async messageReceived(message: TgMessage, ctx: Context, user: IUser): Promise<boolean> {
        LogManager.log('BotRemoveWalletHelper', 'messageReceived', message.text);

        super.messageReceived(message, ctx, user);

        const lines = message.text.split('\n');
        const walletAddresses: string[] = [];
        for (let line of lines) {
            line = line.trim();
            if (line.length == 0){
                continue;
            }

            if (SolanaManager.isValidPublicKey(line) == false){
                await BotManager.reply(ctx, 'Invalid wallet address: ' + line);
                continue;
            }

            walletAddresses.push(line);                
        }

        await WalletManager.removeWallets(message.chat.id, user.id, walletAddresses);
        await UserManager.updateTelegramState(user.id, undefined);

        await BotManager.reply(ctx, 'Done ✅');
        return true;
    }

}