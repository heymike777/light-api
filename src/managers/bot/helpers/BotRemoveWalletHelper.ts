import { SolanaManager } from "../../../services/solana/SolanaManager";
import { LogManager } from "../../LogManager";
import { UserManager } from "../../UserManager";
import { WalletManager } from "../../WalletManager";
import { TgMessage } from "../BotManager";
import { BotHelper, Message } from "./BotHelper";

export class BotRemoveWalletHelper extends BotHelper {

    constructor() {
        LogManager.log('BotRemoveWalletHelper', 'constructor');

        const replyMessage: Message = {
            text: 'Send me wallet address to remove. You can also send me multiple wallets (each wallet address on a new line).'
        };

        super('remove_wallet', replyMessage);
    }

    async messageReceived(message: TgMessage, ctx: any){
        LogManager.log('BotRemoveWalletHelper', 'messageReceived', message.text);

        super.messageReceived(message, ctx);

        const lines = message.text.split('\n');
        const walletAddresses: string[] = [];
        for (let line of lines) {
            line = line.trim();
            if (line.length == 0){
                continue;
            }

            if (SolanaManager.isValidPublicKey(line) == false){
                ctx.reply('Invalid wallet address: ' + line);
                continue;
            }

            walletAddresses.push(line);                
        }

        const user = await UserManager.getUserByTelegramUser(message.from);
        await WalletManager.removeWallets(message.chat.id, user.id, walletAddresses);

        ctx.reply('Done ✅');
    }

}