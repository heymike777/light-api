import { Context } from "grammy";
import { IUser } from "../../../entities/users/User";
import { LogManager } from "../../LogManager";
import { WalletManager } from "../../WalletManager";
import { BotManager } from "../BotManager";
import { BotHelper, Message } from "./BotHelper";
import { AirdropManager } from "../../airdrops/AirdropManager";
import { Helpers } from "../../../services/helpers/Helpers";
import { UserManager } from "../../UserManager";
import { InlineButton } from "../BotTypes";
import { IWallet } from "../../../entities/Wallet";

export class BotAirdropHelper extends BotHelper {

    static supportedAirdrops = ['SNS', 'HUMA'];

    constructor() {
        LogManager.log('BotAirdropHelper', 'constructor');

        const buttons: InlineButton[] = [];
        for (const ticker of BotAirdropHelper.supportedAirdrops) {
            if (buttons.length > 0) {
                buttons.push({ id: 'row', text: '' });
            }
            buttons.push({ id: `airdrops|${ticker}|my_wallets`, text: `${ticker}: my wallets` });
            buttons.push({ id: `airdrops|${ticker}|enter_wallets`, text: `${ticker}: enter wallets` });
        }
        const markup = BotManager.buildInlineKeyboard(buttons);

        const tickers = BotAirdropHelper.supportedAirdrops.map(ticker => `<b>$${ticker}</b>`).join(', ');

        const replyMessage: Message = {
            text: '🪂 Track airdrop allocation. We support: ' + tickers,
            buttons,
            markup,
        };

        super('airdrops', replyMessage);
    }

    async commandReceived(ctx: Context, user: IUser) {

        await UserManager.updateTelegramState(user.id, undefined);

        const buttonId = ctx.update?.callback_query?.data;

        if (ctx?.update?.message?.text == '/airdrops' || buttonId == 'airdrops'){
            return await super.commandReceived(ctx, user);
        }
        else if (buttonId && buttonId.startsWith('airdrops|') ){
            const parts = buttonId.split('|');
            if (parts.length < 3) {
                await BotManager.reply(ctx, 'Invalid button action.');
                return;
            }

            const airdropId = parts[1];
            const action = parts[2];

            if (action == 'my_wallets'){
                const wallets = await WalletManager.fetchWalletsByUserId(user.id);

                if (wallets.length == 0){
                    await BotManager.reply(ctx, 'No wallets found.');
                    return;
                }
                else {
                    const walletAddresses: string[] = wallets.map(w => w.walletAddress);
                    await this.fetchAirdrop(ctx, airdropId, walletAddresses, wallets);
                }
            }
            else if (action == 'enter_wallets'){
                // await UserManager.updateTelegramState(user.id, { airdropId, action });
                // await BotManager.reply(ctx, `Please enter the wallet addresses for the ${airdropId} airdrop, separated by commas.`);
            }
            else {
                await BotManager.reply(ctx, 'Unknown action.');
            }
        }
    }

    async fetchAirdrop(ctx: Context, airdropId: string, walletAddresses: string[], wallets?: IWallet[]) {
        const pendingMsg = await BotManager.reply(ctx, 'Fetching airdrop info...');
        const airdropWallets = await AirdropManager.fetchAirdropInfo(walletAddresses, airdropId);

        if (airdropWallets.length == 0){
            if (pendingMsg){
                await BotManager.deleteMessage(ctx, pendingMsg.message_id, pendingMsg.chat.id);
            }
            
            await BotManager.reply(ctx, 'No airdrop allocation found.');
            return;
        }
        else {
            let response = '';

            for (let i = 0; i < airdropWallets.length; i++){
                const info = airdropWallets[i];
                const wallet = wallets?.find(w => w.walletAddress == info.walletAddress);
                const shortWalletAddress = Helpers.prettyWallet(info.walletAddress);
                const walletTitle = wallet?.title ? `${wallet.title} (${shortWalletAddress})` : shortWalletAddress;
                response += `\n${walletTitle} - <b>${info.tokensToClaim} ${airdropId}</b>`;

                if (info.tokensClaimed && info.tokensClaimed > 0){
                    response += ` (${info.tokensClaimed} claimed)`;
                }
            }
            //TODO: should split into multiple messages if too long

            if (response.length > 0){
                await BotManager.reply(ctx, response);
            }

            if (pendingMsg){
                await BotManager.deleteMessage(ctx, pendingMsg.message_id, pendingMsg.chat.id);
            }

        }
    }


}