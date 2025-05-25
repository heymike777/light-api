import { Context } from "grammy";
import { IUser } from "../../../entities/users/User";
import { LogManager } from "../../LogManager";
import { WalletManager } from "../../WalletManager";
import { BotManager } from "../BotManager";
import { BotHelper, Message } from "./BotHelper";
import { AirdropManager } from "../../airdrops/AirdropManager";

export class BotAirdropHelper extends BotHelper {

    constructor() {
        LogManager.log('BotAirdropHelper', 'constructor');

        const replyMessage: Message = {
            text: 'Send me wallet address to remove. You can also send me multiple wallets (each wallet address on a new line).'
        };

        super('airdrops', replyMessage, ['airdrop']);
    }

    async commandReceived(ctx: Context, user: IUser) {
        let response = '';

        const wallets = await WalletManager.fetchWalletsByUserId(user.id);
        if (wallets.length == 0){
            response = 'No wallets found.';
        }
        else {
            const walletAddresses: string[] = wallets.map(w => w.walletAddress);
            const sns = await AirdropManager.fetchSnsAirdropInfo(walletAddresses);

            response += 'SNS:';
            if (sns.length == 0){
                response += ' No wallets found.';
            }
            else {
                for (let i = 0; i < sns.length; i++){
                    const info = sns[i];
                    const wallet = wallets.find(w => w.walletAddress == info.walletAddress);
                    const walletTitle = wallet ? ` (${wallet.title})` : '';
                    response += `\n${i + 1}. ${info.walletAddress}${walletTitle} - ${info.tokensToClaim} SNS`;

                    if (info.tokensClaimed && info.tokensClaimed > 0){
                        response += ` (${info.tokensClaimed} SNS claimed)`;
                    }
                }
            }
        }

        if (response.length > 0){
            await BotManager.reply(ctx, response);
        }
    }

}