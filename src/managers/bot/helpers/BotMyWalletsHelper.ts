import { SolanaManager } from "../../../services/solana/SolanaManager";
import { WalletManager } from "../../WalletManager";
import { TgMessage } from "../BotManager";
import { BotHelper, Message } from "./BotHelper";

export class BotMyWalletsHelper extends BotHelper {

    constructor() {
        console.log('BotMyWalletsHelper', 'constructor');

        const replyMessage: Message = {
            text: 'Send me wallet address to remove. You can also send me multiple wallets (each wallet address on a new line).'
        };

        super('my_wallets', replyMessage);
    }

    async commandReceived(ctx: any) {
        let response = '';

        const chatId = this.getChatId(ctx);
        const wallets = await WalletManager.fetchWalletsByChatId(chatId);
        if (wallets.length == 0){
            response = 'No wallets found.';
        }
        else {
            response = 'Your wallets:\n\n';
            let index = 1;
            for (let wallet of wallets){
                response += `${index}. ${wallet.walletAddress} ${wallet.title || ''}\n`;
                index++;
            }
        }

        ctx.reply(response);
    }

    async messageReceived(message: TgMessage, ctx: any){
        console.log('BotMyWalletsHelper', 'messageReceived', message.text);

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

        await WalletManager.removeWallets(message.chat.id, walletAddresses);

        ctx.reply('Done ✅');
    }

}