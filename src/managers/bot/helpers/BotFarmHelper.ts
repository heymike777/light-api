import { Context } from "grammy";
import { UserManager } from "../../UserManager";
import { BotHelper, Message } from "./BotHelper";
import { IUser, TelegramWaitingType, User } from "../../../entities/users/User";
import { BotManager } from "../BotManager";
import { TraderProfilesManager } from "../../TraderProfilesManager";
import { Currency } from "../../../models/types";
import { TokenManager } from "../../TokenManager";
import { LogManager } from "../../LogManager";
import { BotKeyboardMarkup, InlineButton, TgMessage } from "../BotTypes";
import { SwapManager } from "../../SwapManager";
import { ExplorerManager } from "../../../services/explorers/ExplorerManager";
import { Chain } from "../../../services/solana/types";
import { getNativeToken } from "../../../services/solana/Constants";

export class BotFarmHelper extends BotHelper {

    constructor() {
        const replyMessage: Message = {
            text: '⛏️ Pump farm'
        };

        super('farm', replyMessage);
    }

    async commandReceived(ctx: Context, user: IUser) {
        await UserManager.updateTelegramState(user.id, undefined);

        const buttonId = ctx.update?.callback_query?.data;

        if (ctx?.update?.message?.text == '/farm' || buttonId == 'farm'){

            const replyMessage = await BotFarmHelper.buildInitReplyMessage(user);
            return await super.commandReceived(ctx, user, replyMessage);
        }
        // else if (buttonId && buttonId.startsWith('buy|')){
        //     const parts = buttonId.split('|');
        //     if (parts.length == 4){
        //         const chain = parts[1] as Chain;
        //         const mint: string = parts[2];

        //         const traderProfile = await TraderProfilesManager.getUserDefaultTraderProfile(user.id);
        //         if (!traderProfile){
        //             await BotManager.reply(ctx, '🟡 Please, create a trader profile first');
        //             return;
        //         }

        //         const currency = traderProfile.currency || Currency.SOL;

        //         if (parts[3] == 'refresh'){
        //             const token = await TokenManager.getToken(chain, mint);
        //             if (token){
        //                 const botUsername = BotManager.getBotUsername(ctx);
        //                 const { message, markup } = await BotManager.buildBuyMessageForToken(token, user, traderProfile, botUsername);
        //                 await BotManager.editMessage(ctx, message, markup);
        //             }
        //         }
        //         else if (parts[3] == 'x' || parts[3] == 'X') {
        //             const currencyName = currency == Currency.SOL ? getNativeToken(chain).symbol : currency;

        //             await UserManager.updateTelegramState(user.id, { waitingFor: TelegramWaitingType.BUY_AMOUNT, data: { chain, mint, traderProfileId: traderProfile?.id, currency }, helper: this.kCommand });
        //             await BotManager.reply(ctx, `Enter ${currencyName} amount`);
        //         }
        //         else {
        //             const amount = parseFloat(parts[3]);
        //             if (amount > 0){
        //                 await this.buy(ctx, user, chain, mint, amount, currency, traderProfile.id);
        //             }
        //         }
        //     }
        //     else {
        //         LogManager.error('Invalid buttonId:', buttonId);
        //     }
        // }
    }

    // async messageReceived(message: TgMessage, ctx: Context, user: IUser): Promise<boolean> {
    //     LogManager.log('BotBuylHelper', 'messageReceived', message.text);

    //     super.messageReceived(message, ctx, user);

    //     if (user.telegramState?.waitingFor == TelegramWaitingType.BUY_AMOUNT){
    //         const amountString = message.text.trim().replaceAll(',', '.');
    //         const amount = parseFloat(amountString);
    //         if (isNaN(amount) || amount <= 0){
    //             await BotManager.reply(ctx, 'Invalid amount. Please, try again.');
    //             return false;
    //         }

    //         const chain: Chain = user.telegramState.data.chain;
    //         const mint: string = user.telegramState.data.mint;
    //         const currency: Currency = user.telegramState.data.currency;
    //         const traderProfileId: string = user.telegramState.data.traderProfileId;

    //         await this.buy(ctx, user, chain, mint, amount, currency, traderProfileId);

    //         await UserManager.updateTelegramState(user.id, undefined);
    //         return true;
    //     }

    //     return false;
    // }

    // async buy(ctx: Context, user: IUser, chain: Chain, mint: string, amount: number, currency: Currency, traderProfileId: string) {
    //     let tokenName: string | undefined = mint;
    //     try {
    //         const token = await TokenManager.getToken(chain, mint);
    //         if (token?.symbol){
    //             tokenName = token.symbol;
    //         }
    //     } catch (error: any) {
    //         LogManager.error('Error getting token', error);
    //     }

    //     const kSOL = getNativeToken(chain);
    //     const currencyName = currency == Currency.SOL ? kSOL.symbol : currency;

    //     const message = await BotManager.reply(ctx, `Buying <a href="${ExplorerManager.getUrlToAddress(chain, mint)}">${tokenName}</a> for ${amount} ${currencyName}.\n\nPlease, wait...`);      

    //     try {
    //         const { signature, swap } = await SwapManager.initiateBuy(user, chain, traderProfileId, mint, amount);

    //         let msg = `🟡 Transaction sent. Waiting for confirmation.`
    //         if (swap.intermediateWallet){
    //             msg += `\n\nIntermediate wallet:\n<code>${swap.intermediateWallet.publicKey}</code> (Tap to copy)`;
    //         }
    //         if (signature){
    //             msg += '\n\n';
    //             msg += `<a href="${ExplorerManager.getUrlToTransaction(chain, signature)}">Explorer</a>`;
    //         }
    //         if (message){
    //             await BotManager.editMessage(ctx, msg, undefined, message.message_id);
    //         }
    //         else {
    //             await BotManager.reply(ctx, msg);
    //         }
    //     }
    //     catch (error: any) {
    //         const msg = `🔴 Error buying <a href="${ExplorerManager.getUrlToAddress(chain, mint)}">${tokenName}</a> for ${amount} ${currencyName}. Try again.\n\nError: ${error.message}`;

    //         if (message){
    //             await BotManager.editMessage(ctx, msg, undefined, message.message_id);
    //         }
    //         else {
    //             await BotManager.reply(ctx, msg);
    //         }
    //     }
    // }

    static async buildInitReplyMessage(user: IUser): Promise<Message> {

        if (user.defaultChain != Chain.SONIC){
            const buttons: InlineButton[] = [
                { id: `settings|set_chain|${Chain.SONIC}`, text: `🔗 Switch to Sonic SVM` }
            ];
            const markup = BotManager.buildInlineKeyboard(buttons);
            return { 
                text: '⛏️ Pump farm is only available on Sonic SVM for now.',
                buttons: buttons,
                markup: markup
            };
        }

        return {
            text: '⛏️ Pump farm',
        }

        // const currency = traderProfile?.currency || Currency.SOL;
        // const buyAmounts: number[] = traderProfile?.buyAmounts || (currency == Currency.SOL ? [0.5, 1] : [50, 100]);
        // const sellAmounts: number[] = traderProfile?.sellAmounts || [50, 100];
        // const mintInfo = await SolanaManager.getTokenMint(token.chain, token.address);
        // const kSOL = getNativeToken(token.chain);
        // const currencySymbol = currency == Currency.SOL ? kSOL.symbol : currency;

        // const buttons: InlineButton[] = [
        //     { id: `buy|${token.chain}|${token.address}|refresh`, text: '↻ Refresh' },
        //     { id: 'row', text: '' },
        // ];



        // for (const amount of buyAmounts) {
        //     buttons.push({ id: `buy|${token.chain}|${token.address}|${amount}`, text: `Buy ${amount} ${currencySymbol}` });
        // }
        // buttons.push({ id: `buy|${token.chain}|${token.address}|X`, text: `Buy X ${currencySymbol}` });

        // let message = `<b>${token.symbol}</b> (${token.name})`;

        // const dexscreenerUrl = ExplorerManager.getDexscreenerTokenUrl(token.address, token.chain);
        // if (dexscreenerUrl){
        //     message += ` ᐧ <a href="${dexscreenerUrl}">📈</a>`;
        // }

        // const bubblemapsUrl = ExplorerManager.getBubblemapsTokenUrl(token.address, token.chain);
        // if (bubblemapsUrl){
        //     message += ` ᐧ <a href="${bubblemapsUrl}">🫧</a>`;
        // }

        // if (token.chain != Chain.SOLANA){
        //     message += ` — 🔗 ${ChainManager.getChainTitle(token.chain)}`;
        // }

        // message += '\n';
        // message += `<code>${token.address}</code>`;
        // if (user.referralCode){
        //     const reflink = ExplorerManager.getTokenReflink(token.address, user.referralCode, botUsername);
        //     message += `\n<a href="${reflink}">Share token with your Reflink</a>`;    
        // }

        // if (mintInfo){
        //     message += `\n\n⚙️ Security:`;
        //     message += `\n├ Mint Authority: ${mintInfo.mintAuthority ? `Yes 🔴` : 'No 🟢'}`;
        //     message += `\n└ Freeze Authority: ${mintInfo.freezeAuthority ? `Yes 🔴` : 'No 🟢'}`;    
        // }
        
        // let solBalance: TokenBalance | undefined = undefined;
        // if (traderProfile && traderProfile.encryptedWallet?.publicKey){
        //     const walletAddress = traderProfile.encryptedWallet.publicKey;
        //     solBalance = await SolanaManager.getWalletSolBalance(token.chain, walletAddress);
        //     const tokenBalance = await SolanaManager.getWalletTokenBalance(token.chain, walletAddress, token.address);

        //     message += '\n\n';
        //     message += `Balance: ${solBalance?.uiAmount || 0} ${kSOL.symbol}`;
        //     if (tokenBalance && tokenBalance.uiAmount>0){
        //         message += ` | ${tokenBalance.uiAmount} ${token.symbol}`;

        //         buttons.push({ id: 'row', text: '' });
        //         for (const amount of sellAmounts) {
        //             buttons.push({ id: `sell|${token.chain}|${token.address}|${amount}`, text: `Sell ${amount}%` });
        //         }
        //         buttons.push({ id: `sell|${token.chain}|${token.address}|X`, text: `Sell X%` });
        //     }
        //     message += ` — <b>${traderProfile.title}</b> ✏️`;

        //     if (token.chain == Chain.SOLANA){
        //         const lpBalances = await TraderProfilesManager.fetchTokenLpMintBalance(token.chain, SwapDex.RAYDIUM_AMM, token.address, walletAddress);
        //         if (lpBalances && lpBalances.balances.length > 0){
        //             const solBalance = lpBalances.balances.find(b => b.mint == kSolAddress);
        //             const tokenBalance = lpBalances.balances.find(b => b.mint == token.address);
        //             const usdValue = (tokenBalance?.uiAmount || 0) * (token.price || 0) + (solBalance?.uiAmount || 0) * TokenManager.getNativeTokenPrice(token.chain);

        //             if (solBalance?.uiAmount || tokenBalance?.uiAmount){
        //                 const solBalanceString = Helpers.prettyNumberFromString('' + (solBalance?.uiAmount || 0), 3);
        //                 const tokenBalanceString = Helpers.prettyNumberFromString('' + (tokenBalance?.uiAmount || 0), 3);

        //                 message += `\nLP: ${tokenBalanceString} ${token.symbol} + ${solBalanceString} ${kSOL.symbol} = $${Helpers.numberFormatter(usdValue, 2)}`;

        //                 let btnIndex = 0;
        //                 for (const amount of sellAmounts) {
        //                     if (btnIndex % 2 == 0){ buttons.push({ id: 'row', text: '' }); }

        //                     buttons.push({ id: `sell_lp|${token.chain}|${token.address}|${amount}`, text: `Sell (LP) ${amount}%` });
        //                     btnIndex++;                    
        //                 }
        //                 if (btnIndex % 2 == 0){ buttons.push({ id: 'row', text: '' }); }
        //                 buttons.push({ id: `sell_lp|${token.chain}|${token.address}|X`, text: `Sell (LP) X%` });
        //             }
        //         }
        //     }
        // }

        // const metricsMessage = BotManager.buildTokenMetricsMessage(token);
        // if (metricsMessage){
        //     message += '\n\n';
        //     message += metricsMessage;
        // }

        // if (traderProfile && traderProfile.encryptedWallet?.publicKey){
        //     if (!solBalance || solBalance.uiAmount < 0.01){
        //         message += `\n\n🔴 Send some ${kSOL.symbol} to your trading wallet to ape into memes and cover gas fee.`;                
        //     }
        // }

        // const markup = BotManager.buildInlineKeyboard(buttons);

        // return { message, markup };
    }

}