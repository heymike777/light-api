import { Context } from "grammy";
import { IUser, TelegramWaitingType } from "../../../entities/users/User";
import { LogManager } from "../../LogManager";
import { WalletManager } from "../../WalletManager";
import { BotManager } from "../BotManager";
import { BotHelper, Message } from "./BotHelper";
import { AirdropManager } from "../../airdrops/AirdropManager";
import { Helpers } from "../../../services/helpers/Helpers";
import { UserManager } from "../../UserManager";
import { InlineButton, TgMessage } from "../BotTypes";
import { IWallet } from "../../../entities/Wallet";
import { SolanaManager } from "../../../services/solana/SolanaManager";
import { BonfidaManager } from "../../../services/solana/BonfidaManager";
import { MixpanelManager } from "../../MixpanelManager";

export class BotAirdropHelper extends BotHelper {

    static supportedAirdrops = ['SNS', 'HUMA'];
    static MAX_WALLETS_PER_AIRDROP_CHECK = 10;

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
            text: '🪂 Track airdrop allocation.\n\nWe support: ' + tickers,
            buttons,
            markup,
            photo: 'https://light.dangervalley.com/static/airdrops/DEFAULT.png',
        };

        super('airdrops', replyMessage);
    }

    async commandReceived(ctx: Context, user: IUser) {

        await UserManager.updateTelegramState(user.id, undefined);

        const buttonId = ctx.update?.callback_query?.data;

        if (ctx?.update?.message?.text == '/airdrops' || buttonId == 'airdrops'){
            MixpanelManager.track('Airdrops checker', user.id, { });
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
                MixpanelManager.track('Airdrops checker: my wallets', user.id, { walletsCount: wallets.length, airdropId });

                if (wallets.length == 0){
                    const buttons: InlineButton[] = [
                        {id: 'add_wallet', text: '➕ Add wallets'},
                    ];
                    const markup = BotManager.buildInlineKeyboard(buttons);
                    await BotManager.reply(ctx, 'No wallets found. Add your wallets to start receiving every transaction, airdrop allocation, and more — all in one place.', { reply_markup: markup });
                    return;
                }
                else {
                    const walletAddresses: string[] = wallets.map(w => w.walletAddress);
                    await BotAirdropHelper.fetchAirdrop(ctx, airdropId, walletAddresses, wallets);
                }
            }
            else if (action == 'enter_wallets'){
                await UserManager.updateTelegramState(user.id, { waitingFor: TelegramWaitingType.AIRDROP_WALLETS, data: { airdropId }, helper: this.kCommand });
                await BotManager.reply(ctx, `Send each wallet address on a new line. You can enter up to ${BotAirdropHelper.MAX_WALLETS_PER_AIRDROP_CHECK} addresses.`);
            }
            else {
                await BotManager.reply(ctx, 'Unknown action.');
            }
        }
    }

    async messageReceived(message: TgMessage, ctx: Context, user: IUser): Promise<boolean> {
        super.messageReceived(message, ctx, user);

        if (user.telegramState?.waitingFor == TelegramWaitingType.AIRDROP_WALLETS) {
            const lines = message.text.split('\n');
            const walletAddresses: string[] = [];
            const wallets: {walletAddress: string, title?: string}[] = [];
            for (let line of lines) {
                let walletAddress = line.trim();
                if (walletAddress.length == 0){
                    continue;
                }

                if (walletAddress.endsWith('.sol')){
                    const tmp = await BonfidaManager.resolveDomain(walletAddress);
                    if (tmp){
                        wallets.push({ walletAddress: tmp, title: walletAddress });
                        walletAddress = tmp;
                    }
                }

                if (SolanaManager.isValidPublicKey(walletAddress) == false){
                    await BotManager.reply(ctx, 'Invalid wallet address: ' + walletAddress);
                    continue;
                }

                walletAddresses.push(walletAddress);                
            }

            MixpanelManager.track('Airdrops checker: enter wallets', user.id, { walletsCount: walletAddresses.length, airdropId: user.telegramState?.data?.airdropId });

            if (walletAddresses.length > BotAirdropHelper.MAX_WALLETS_PER_AIRDROP_CHECK){
                await BotManager.reply(ctx, `You can enter up to ${BotAirdropHelper.MAX_WALLETS_PER_AIRDROP_CHECK} wallet addresses at a time.`);
                return false;
            }

            await BotAirdropHelper.fetchAirdrop(ctx, user.telegramState?.data?.airdropId, walletAddresses, wallets);
            await UserManager.updateTelegramState(user.id, undefined);

            return true;
        }

        return false; // Not handled by this helper
    }

    static async fetchAirdrop(ctx: Context | undefined, airdropId: string, walletAddresses: string[], wallets?: {walletAddress: string, title?:string}[], user?: IUser) {
        const airdropWallets = await AirdropManager.fetchAirdropInfo(walletAddresses, airdropId, ctx);
        const image = `https://light.dangervalley.com/static/airdrops/${airdropId}.png`;

        if (airdropWallets.length == 0){
            if (ctx) {
                await BotManager.replyWithPhoto(ctx, image, 'No airdrop allocation found.');
            }
            return;
        }
        else {
            const batchSize = 20;
            const batches = [];
            for (let i = 0; i < airdropWallets.length; i += batchSize) {
                const batch = airdropWallets.slice(i, i + batchSize);
                if (batch.length > 0) {
                    batches.push(batch);
                }
            }

            let totalTokensToClaim = airdropWallets.reduce((sum, info) => sum + info.tokensToClaim, 0);
            let totalTokensClaimed = airdropWallets.reduce((sum, info) => sum + (info.tokensClaimed || 0), 0);
            let response = '';
            for (const batch of batches) {
                response = '';

                for (let i = 0; i < batch.length; i++){
                    const info = batch[i];
                    const wallet = wallets?.find(w => w.walletAddress == info.walletAddress);
                    const shortWalletAddress = Helpers.prettyWallet(info.walletAddress);
                    const walletTitle = wallet?.title ? `${wallet.title} (${shortWalletAddress})` : shortWalletAddress;
                    response += `\n${walletTitle} - <b>${info.tokensToClaim} ${airdropId}</b>`;

                    if (info.tokensClaimed && info.tokensClaimed > 0){
                        response += ` (${info.tokensClaimed} claimed)`;
                    }

                    if (info.tokensToClaim > 0){
                        response += ` 🎁`;
                    }
                }

                if (batches.length > 1){
                    if (ctx){
                        await BotManager.replyWithPhoto(ctx, image, response);               
                    } else if (user && user.telegram?.id) {
                        // send to user
                        await BotManager.sendMessage({
                            id: `user_${user.id}_airdrop_checker_${Helpers.makeid(12)}`,
                            userId: user.id,
                            chatId: user.telegram?.id, 
                            text: response, 
                            imageUrl: image 
                        });
                    }
                }
            }

            if (batches.length == 1){
                response += `\n\n<b>Total:</b> ${totalTokensToClaim} ${airdropId}`;
                if (totalTokensClaimed > 0){
                    response += `\n<b>Claimed:</b> ${totalTokensClaimed} ${airdropId}`;
                }

                if (ctx){
                    await BotManager.replyWithPhoto(ctx, image, response);               
                } else if (user && user.telegram?.id) {
                    // send to user
                    await BotManager.sendMessage({
                        id: `user_${user.id}_airdrop_checker_${Helpers.makeid(12)}`,
                        userId: user.id,
                        chatId: user.telegram?.id, 
                        text: response, 
                        imageUrl: image 
                    });
                }
            }
        }
    }


}