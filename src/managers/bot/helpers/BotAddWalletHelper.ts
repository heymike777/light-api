import { PremiumError } from "../../../errors/PremiumError";
import { BonfidaManager } from "../../../services/solana/BonfidaManager";
import { newConnection } from "../../../services/solana/lib/solana";
import { SolanaManager } from "../../../services/solana/SolanaManager";
import { UserManager } from "../../UserManager";
import { WalletManager } from "../../WalletManager";
import { TgMessage } from "../BotManager";
import { BotHelper, Message } from "./BotHelper";

export class BotAddWalletHelper extends BotHelper {

    constructor() {
        console.log('BotAddWalletHelper', 'constructor');

        const replyMessage: Message = {
            text: 'Send me each wallet address on a new line.\n\n' + 
                    'You can assign a nickname to any wallet, add it after a space following the wallet address.\n\n' + 
                    'For example:\n' +
                    'WalletAddress1 Name1\n' +
                    'WalletAddress2 Name2\n' +
                    'WalletAddress3 Name3'
        };

        super('add_wallet', replyMessage);
    }

    async messageReceived(message: TgMessage, ctx: any){
        console.log('BotAddWalletHelper', 'messageReceived', message.text);

        super.messageReceived(message, ctx);

        const lines = message.text.split('\n');
        const wallets: {address: string, title?: string}[] = [];
        for (let line of lines) {
            line = line.trim();
            if (line.length == 0){
                continue;
            }
            const parts = line.split(' ');
            let walletAddress = parts.shift();
            let title = parts.length>0 ? parts.join(' ') : undefined;
            title = title?.trim();
            if (title?.length == 0){
                title = undefined;
            }

            if (!walletAddress){
                continue;
            }

            if (walletAddress.endsWith('.sol')){
                const tmp = await BonfidaManager.resolveDomain(walletAddress);
                if (tmp){
                    walletAddress = tmp;
                }
            }

            if (SolanaManager.isValidPublicKey(walletAddress) == false){
                ctx.reply('Invalid wallet address: ' + walletAddress);
                continue;
            }

            wallets.push({address: walletAddress, title: title});                
        }

        let walletsCounter = 0;
        let hasLimitError = false;
        const user = await UserManager.getUserByTelegramUser(message.from);
        for (const wallet of wallets) {
            try {
                await WalletManager.addWallet(message.chat.id, user, wallet.address, wallet.title);
                walletsCounter++;
            }
            catch (err){
                console.log('BotAddWalletHelper', 'messageReceived', 'error', err);
                if (!hasLimitError && err instanceof PremiumError){
                    hasLimitError = true;
                    ctx.reply(err.message);
                }
            }
        }

        if (walletsCounter == 0){
            if (!hasLimitError){
                ctx.reply('No wallets found!');
            }
        }
        else if (walletsCounter == 1){
            ctx.reply('Wallet saved! We will start tracking it immediately.');
        }
        else {
            ctx.reply(`${walletsCounter} wallets saved! We will start tracking them immediately.`);
        }
    }

}