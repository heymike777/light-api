import { Bot, Context, GrammyError, HttpError, InlineKeyboard } from "grammy";
import { IMessage, Message } from "../../entities/Message";
import { BotAddWalletHelper } from "./helpers/BotAddWalletHelper";
import { BotHelper } from "./helpers/BotHelper";
import { BotStartHelper } from "./helpers/BotStartHelper";
import { BotRemoveWalletHelper } from "./helpers/BotRemoveWalletHelper";
import { BotMyWalletsHelper } from "./helpers/BotMyWalletsHelper";
import { UserManager } from "../UserManager";
import { IUser, User, UserBotStatus } from "../../entities/users/User";
import { autoRetry } from "@grammyjs/auto-retry";
import * as GrammyTypes from "grammy/types";
import { LogManager } from "../LogManager";
import { EnvManager } from "../EnvManager";
import { MicroserviceManager } from "../MicroserviceManager";
import { BotConnectEmailHelper } from "./helpers/BotConnectEmailHelper";
import { BotRevokeAccountHelper } from "./helpers/BotRevokeAccountHelper";
import { BotTraderProfilesHelper } from "./helpers/BotTradingProfilesHelper";
import { BotDeleteMessageHelper } from "./helpers/BotDeleteMessageHelper";
import { BotBuyHelper } from "./helpers/BotBuyHelper";
import { BotKeyboardMarkup, InlineButton, SendMessageData, TgMessage } from "./BotTypes";
import { SearchManager } from "../SearchManager";
import { ITokenModel } from "../../entities/tokens/Token";
import { TraderProfilesManager } from "../TraderProfilesManager";
import { IUserTraderProfile } from "../../entities/users/TraderProfile";
import { Currency } from "../../models/types";
import { ExplorerManager } from "../../services/explorers/ExplorerManager";
import { SolanaManager, TokenBalance } from "../../services/solana/SolanaManager";
import { newConnection, newConnectionByChain } from "../../services/solana/lib/solana";
import { TokenManager } from "../TokenManager";
import { Helpers } from "../../services/helpers/Helpers";
import { BotSellHelper } from "./helpers/BotSellHelper";
import { kSolAddress } from "../../services/solana/Constants";
import { Chain } from "../../services/solana/types";

export class BotManager {
    bot: Bot;
    helpers: BotHelper[] = [
        new BotStartHelper(),
        new BotAddWalletHelper(),
        new BotRemoveWalletHelper(),
        new BotMyWalletsHelper(),
        new BotConnectEmailHelper(),
        new BotRevokeAccountHelper(),
        new BotTraderProfilesHelper(),
        new BotDeleteMessageHelper(),
        new BotBuyHelper(),
        new BotSellHelper(),
    ];

    constructor() {
        LogManager.log('BotManager', 'constructor');

        LogManager.log('Starting bot...');
        this.bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);

        this.bot.api.config.use(autoRetry());
    
        this.bot.on('message', (ctx: Context) => {
            this.onMessage(ctx.update.message as TgMessage, ctx);
        });

        this.bot.catch((err) => {
            const ctx = err.ctx;
            LogManager.error(`Error while handling update from chatId: ${ctx.chat?.id}:`);
            const e = err.error;
            if (e instanceof GrammyError) {
                LogManager.error("!catched by bot. GrammyError. Error in request:", e.description);
            } else if (e instanceof HttpError) {
                LogManager.error("!catched by bot. HttpError. Could not contact Telegram:", e);
            } else {
                LogManager.error("!catched by bot. Unknown error:", e);
            }
        });

        // this.bot.on("message:new_chat_members:is_bot", async (ctx) => {
        //     LogManager.log('Bot joined chat', ctx.chat.id);
        // });

        this.bot.on("my_chat_member", async (ctx) => {            
            const botUsername = ctx.myChatMember?.new_chat_member?.user?.username;        
            if (ctx.myChatMember.new_chat_member.status == 'kicked'){        
                console.log(`User ${ctx.myChatMember.from.id} (${ctx.myChatMember.from.username}) blocked bot ${botUsername}`);
                
                // handle user blocked bot
                if (botUsername){
                    const user = await UserManager.getUserByTelegramUser(ctx.myChatMember.from);
                    if (user){
                        if (!user.bots){
                            user.bots = {};
                        }
                        user.bots[botUsername] = UserBotStatus.BLOCKED;
                        await User.updateOne({ _id: user._id }, {
                            $set: {
                                bots: user.bots,
                            }
                        });
                    }
                }
            }
        });

        this.bot.on("callback_query:data", async (ctx) => {
            let buttonId = ctx.callbackQuery.data.split('|')[0];
            const user = await UserManager.getUserByTelegramUser(ctx.callbackQuery.from);

            await UserManager.updateTelegramState(user.id, undefined); // reset user's state

            const helper = await this.findHelperByCommand(buttonId);
            if (helper && ctx.chat){
                helper.commandReceived(ctx, user);
            }
            else {
                LogManager.error('Unknown command:', buttonId);
                await BotManager.reply(ctx, `🔴 Unknown command`);
            }

            await ctx.answerCallbackQuery(); // remove loading animation
        });
    
        this.bot.start();
        LogManager.log('Bot started!');    
    }

    async onCommand(command: string, ctx: Context, user: IUser){
        const helper = await this.findHelperByCommand(command);
        if (helper){
            helper.commandReceived(ctx, user);
        }
        else {
            LogManager.error('Unknown command', command);
        } 
    }

    async onMessage(message: TgMessage, ctx: Context){
        LogManager.log('onMessage', message);

        const user = await UserManager.getUserByTelegramUser(message.from, true);

        this.saveMessageToDB(message);
        
        if (message.text.startsWith('/')){
            const command = message.text.substring(1);
            this.onCommand(command, ctx, user);
            return;
        }

        if (user.telegramState && user.telegramState.helper){
            const helper = await this.findHelperByCommand(user.telegramState.helper);
            if (helper){
                const success = await helper.messageReceived(message, ctx, user);
                if (success){
                    return;
                }
            }
        }

        await UserManager.updateTelegramState(user.id, undefined); // reset user's state, if no found helper

        await BotManager.tryToSendTokenInfo(ctx, message.text, user);
    }

    static async tryToSendTokenInfo(ctx: Context, query: string, user: IUser){
        const tokens = await SearchManager.search(query, user.id);
        if (tokens.length > 0){
            const traderProfile = await TraderProfilesManager.getUserDefaultTraderProfile(user.id);
            const botUsername = BotManager.getBotUsername(ctx);
            const { message, markup } = await BotManager.buildBuyMessageForToken(tokens[0], user, traderProfile, botUsername);
            await BotManager.reply(ctx, message, { 
                reply_markup: markup 
            });
        }
        else {
            await BotManager.reply(ctx, '🔴 No tokens found');
        }

    }

    async findHelperByCommand(command: string): Promise<BotHelper | undefined> {
        if (command.startsWith('start')){
            return this.helpers.find(helper => helper.kCommand == 'start');
        }

        return this.helpers.find(helper => helper.kCommand == command || (helper.kAdditionalCommands && helper.kAdditionalCommands.includes(command)));
    }

    async saveMessageToDB(message: TgMessage): Promise<IMessage> {
        const newMessage = new Message();
        newMessage.chatId = message.chat.id;
        newMessage.firstName = message.from.first_name;
        newMessage.lastName = message.from.last_name;
        newMessage.username = message.from.username;
        newMessage.isPremium = message.from.is_premium || false;
        newMessage.isBot = message.from.is_bot;
        newMessage.languageCode = message.from.language_code;
        newMessage.data = message;
        newMessage.createdAt = new Date();
        await newMessage.save();

        return newMessage;
    }

    async sendMessage(data: SendMessageData){
        if (data.imageUrl){
            await this.bot.api.sendPhoto(data.chatId, data.imageUrl, {
                caption: data.text,
                parse_mode: 'HTML', 
                reply_markup: data.inlineKeyboard,
            });    
        }
        else {
            await this.bot.api.sendMessage(data.chatId, data.text || '', {
                parse_mode: 'HTML', 
                link_preview_options: {
                    is_disabled: true
                },
                reply_markup: data.inlineKeyboard,
            });   
        }
    }

    // -------- static --------
    static instance: BotManager | undefined = undefined;
    static async getInstance() {
        if (!BotManager.instance) {
            BotManager.instance = new BotManager();
        }
        return BotManager.instance;        
    }

    static async sendMessage(data: SendMessageData){
        if (EnvManager.isTelegramProcess){
            const botManager = await BotManager.getInstance();
            await botManager.sendMessage(data);    
        }
        else {
            await MicroserviceManager.sendMessageToTelegram(JSON.stringify(data));
        }
    }

    static buildInlineKeyboard(buttons: InlineButton[]): BotKeyboardMarkup | undefined {
        const inlineKeyboard = new InlineKeyboard();
        buttons.forEach(button => {
            if (button.id == 'row'){
                inlineKeyboard.row();
            }
            else if (button.link){
                inlineKeyboard.url(button.text, button.link);

            }
            else {
                inlineKeyboard.text(button.text, button.id);
            }
        });
        return inlineKeyboard;
    }

    static async editMessage(ctx?: Context, text?: string, markup?: BotKeyboardMarkup, sourceMessageId?: number, sourceChatId?: number){
        try {
            const messageId = sourceMessageId || ctx?.message?.message_id || ctx?.update?.callback_query?.message?.message_id || ctx?.callbackQuery?.message?.message_id;
            const chatId = sourceChatId || ctx?.chat?.id || ctx?.update?.callback_query?.message?.chat?.id || ctx?.callbackQuery?.message?.chat?.id;
            if (chatId && messageId && text){
                const botManager = await BotManager.getInstance();
                await botManager.bot.api.editMessageText(chatId, messageId, text, { parse_mode: 'HTML', link_preview_options: {is_disabled: true}, reply_markup: markup });
            }
        }
        catch (e: any){}
    }

    static async editMessageReplyMarkup(ctx?: Context, markup?: BotKeyboardMarkup, sourceMessageId?: number, sourceChatId?: number){
        try {
            const messageId = sourceMessageId || ctx?.message?.message_id || ctx?.update?.callback_query?.message?.message_id || ctx?.callbackQuery?.message?.message_id;
            const chatId = sourceChatId || ctx?.chat?.id || ctx?.update?.callback_query?.message?.chat?.id || ctx?.callbackQuery?.message?.chat?.id;
            if (chatId && messageId){
                const botManager = await BotManager.getInstance();
                await botManager.bot.api.editMessageReplyMarkup(chatId, messageId, { reply_markup: markup });
            }
        }
        catch (e: any){}
    }

    static async deleteMessage(ctx?: Context, sourceMessageId?: number, sourceChatId?: number){
        try {
            const messageId = sourceMessageId || ctx?.message?.message_id || ctx?.update?.callback_query?.message?.message_id || ctx?.callbackQuery?.message?.message_id;
            const chatId = sourceChatId || ctx?.chat?.id || ctx?.update?.callback_query?.message?.chat?.id || ctx?.callbackQuery?.message?.chat?.id;

            if (chatId && messageId){
                const botManager = await BotManager.getInstance();
                await botManager.bot.api.deleteMessage(chatId, messageId);
            }    
        }
        catch (e: any){}
    }

    // other?: Other<R, "sendMessage", "chat_id" | "text">
    static async reply(ctx: Context, text: string, other?: any): Promise<GrammyTypes.Message.TextMessage | undefined> {
        try {
            if (!other){
                other = {};
            }

            other.parse_mode = 'HTML';
            other.link_preview_options = {
                is_disabled: true,
            };

            return await ctx.reply(text, other);
        }
        catch (e: any){
            LogManager.error('BotManager Error while replying', e);
        }
    }

    static async replyWithPhoto(ctx: Context, photo: string, text?: string, markup?: BotKeyboardMarkup): Promise<GrammyTypes.Message.PhotoMessage | undefined> {
        try {
            return await ctx.replyWithPhoto(photo, { 
                caption: text, 
                reply_markup: markup,
                parse_mode: 'HTML',
            });
        }
        catch (e: any){
            LogManager.error('BotManager Error while replying with photo', e);
        }
    }


    static async replyWithPremiumError(ctx: Context, text: string): Promise<GrammyTypes.Message.TextMessage | undefined> {
        try {
            const buttons: InlineButton[] = [
                { id: 'upgrade', text: '👑 Upgrade' },
            ];
            const markup = BotManager.buildInlineKeyboard(buttons);

            return await ctx.reply(text, { parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: markup });
        }
        catch (e: any){
            LogManager.error('BotManager Error while replying', e);
        }
    }

    static async buildBuyMessageForToken(token: ITokenModel, user: IUser, traderProfile?: IUserTraderProfile, botUsername?: string): Promise<{  message: string, markup?: BotKeyboardMarkup }> {
        const currency = traderProfile?.currency || Currency.SOL;
        const buyAmounts: number[] = traderProfile?.buyAmounts || (currency == Currency.SOL ? [0.5, 1] : [50, 100]);
        const sellAmounts: number[] = traderProfile?.sellAmounts || [50, 100];

        const buttons: InlineButton[] = [
            { id: `buy|${token.chain}|${token.address}|refresh`, text: '↻ Refresh' },
            { id: 'row', text: '' },
        ];

        for (const amount of buyAmounts) {
            buttons.push({ id: `buy|${token.chain}|${token.address}|${amount}`, text: `Buy ${amount} ${currency}` });
        }
        buttons.push({ id: `buy|${token.chain}|${token.address}|X`, text: `Buy X ${currency}` });

        let message = `<b>${token.symbol}</b> (${token.name})`;

        const dexscreenerUrl = ExplorerManager.getDexscreenerTokenUrl(token.address, token.chain);
        if (dexscreenerUrl){
            message += ` ᐧ <a href="${dexscreenerUrl}">📈</a>`;
        }

        const bubblemapsUrl = ExplorerManager.getBubblemapsTokenUrl(token.address, token.chain);
        if (bubblemapsUrl){
            message += ` ᐧ <a href="${bubblemapsUrl}">🫧</a>`;
        }

        message += '\n';
        message += `<code>${token.address}</code>`;
        message += '\n';
        const reflink = ExplorerManager.getTokenReflink(token.address, 'default', botUsername); //TODO: set user's refcode instead of default
        message += `<a href="${reflink}">Share token with your Reflink</a>`

        const connection = newConnectionByChain(token.chain);
        let solBalance: TokenBalance | undefined = undefined;
        let tokenBalance: TokenBalance | undefined = undefined;
        if (traderProfile && traderProfile.wallet?.publicKey){
            const walletAddress = traderProfile.wallet.publicKey;
            solBalance = await SolanaManager.getWalletSolBalance(connection, walletAddress);
            tokenBalance = await SolanaManager.getWalletTokenBalance(connection, walletAddress, token.address);

            message += '\n\n';
            message += `Balance: ${solBalance?.uiAmount || 0} SOL`;
            if (tokenBalance && tokenBalance.uiAmount>0){
                message += ` | ${tokenBalance.uiAmount} ${token.symbol}`;

                buttons.push({ id: 'row', text: '' });
                for (const amount of sellAmounts) {
                    buttons.push({ id: `sell|${token.chain}|${token.address}|${amount}`, text: `Sell ${amount}%` });
                }
                buttons.push({ id: `sell|${token.chain}|${token.address}|X`, text: `Sell X%` });
            }
            message += ` — <b>${traderProfile.title}</b> ✏️`;
        }

        const metricsMessage = BotManager.buildTokenMetricsMessage(token);
        if (metricsMessage){
            message += '\n\n';
            message += metricsMessage;
        }

        if (traderProfile && traderProfile.wallet?.publicKey){
            if (!solBalance || solBalance.uiAmount < 0.01){
                message += '\n🔴 Send some SOL to your trading wallet to ape into memes and cover gas fee.';                
            }
        }

        const markup = BotManager.buildInlineKeyboard(buttons);

        return { message, markup };
    }

    static getBotUsername(ctx: Context): string {
        const result = ctx.me.username;
        return result;
    }

    static buildTokenMetricsMessage(token: ITokenModel): string | undefined {
        let tokensMessage: string | undefined = undefined;
        if (token.symbol && !TokenManager.excludedTokens.includes(token.address)){
            tokensMessage = `<b>#${token.symbol}</b>`;
            if (token.name){
                tokensMessage += ` | ${token.name}`;
            }
            if (token.liquidity){
                tokensMessage += ` | LIQ: $${Helpers.numberFormatter(token.liquidity, 2)}`;
            }
            if (token.marketCap){
                tokensMessage += ` | MC: $${Helpers.numberFormatter(token.marketCap, 2)}`;
            }
            if (token.price){
                tokensMessage += ` | P: $${token.price}`;
            }
        }
        return tokensMessage;
    }

    static async buildSellMessage(): Promise<{  message: string, markup?: BotKeyboardMarkup }> {
        return { message: 'test sell message' };
    }

    static async buildPortfolioMessage(traderProfile: IUserTraderProfile, botUsername: string): Promise<{  message: string, markup?: BotKeyboardMarkup }> {
        const chain = Chain.SOLANA; //TODO: fetch portfolio for other chains
        const { values, assets, warning } = await TraderProfilesManager.getPortfolio(chain, traderProfile);

        let message = `<b>${traderProfile.title}</b>${traderProfile.default?' ⭐️':''}`;
        message += `\n<code>${traderProfile.wallet?.publicKey}</code> (Tap to copy)`; 

        if (warning){
            message += `\n\n⚠️ ${warning.message}`;
        }

        if (values){
            message += `\n\nTotal value: $${values.totalPrice}`;
            if (values.pnl){
                message += `\nP&L: $${values.pnl}`;
            }
        }

        if (assets.length == 0){
            message += `\n\nNo assets on this wallet`;
        }
        else {
            message += `\n\nAssets:`;
            for (const asset of assets) {
                message += `\n${asset.symbol}: ${asset.uiAmount}`;
                if (asset.priceInfo){
                    message += ` ($${asset.priceInfo.totalPrice})`;
                }

                if (asset.address != kSolAddress){
                    message += ` <a href="${ExplorerManager.getTokenReflink(asset.address, undefined, botUsername)}">[Sell]</a>`;
                }
            }
        }

        return { message, markup: undefined };
    }
     

}