import { Context } from "grammy";
import { PremiumError } from "../../../errors/PremiumError";
import { BonfidaManager } from "../../../services/solana/BonfidaManager";
import { newConnection } from "../../../services/solana/lib/solana";
import { SolanaManager } from "../../../services/solana/SolanaManager";
import { LogManager } from "../../LogManager";
import { UserManager } from "../../UserManager";
import { WalletManager } from "../../WalletManager";
import { TgMessage } from "../BotManager";
import { BotHelper, Message } from "./BotHelper";
import { IUser, TelegramWaitingType } from "../../../entities/users/User";

export class BotAddWalletHelper extends BotHelper {

    constructor() {
        LogManager.log('BotAddWalletHelper', 'constructor');

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

    async commandReceived(ctx: Context, user: IUser) {
        await UserManager.updateTelegramState(user.id, { waitingFor: TelegramWaitingType.ADD_WALLET, helper: this.kCommand });
        await super.commandReceived(ctx, user);
    }

    async messageReceived(message: TgMessage, ctx: Context, user: IUser): Promise<boolean> {
        LogManager.log('BotAddWalletHelper', 'messageReceived', message.text);

        super.messageReceived(message, ctx, user);

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
        // const user = await UserManager.getUserByTelegramUser(message.from);
        for (const wallet of wallets) {
            try {
                await WalletManager.addWallet(message.chat.id, user, wallet.address, wallet.title);
                walletsCounter++;
            }
            catch (err){
                LogManager.log('BotAddWalletHelper', 'messageReceived', 'error', err);
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

        await UserManager.updateTelegramState(user.id, undefined);

        return true;
    }

}