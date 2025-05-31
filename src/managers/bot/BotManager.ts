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
import { TokenManager } from "../TokenManager";
import { Helpers } from "../../services/helpers/Helpers";
import { BotSellHelper } from "./helpers/BotSellHelper";
import { getNativeToken, kSolAddress } from "../../services/solana/Constants";
import { Chain } from "../../services/solana/types";
import { BotReferralProgramHelper } from "./helpers/BotReferralProgramHelper";
import { BotUpgradeHelper } from "./helpers/BotUpgradeHelper";
import { BotSettingsHelper } from "./helpers/BotSettingsHelper";
import { BotHelpHelper } from "./helpers/BotHelpHelper";
import { SwapDex } from "../../entities/payments/Swap";
import { BotNoneHelper } from "./helpers/BotNoneCommand";
import { ChainManager } from "../chains/ChainManager";
import { BotAdminHelper } from "./helpers/BotAdminHelper";
import { limit } from "@grammyjs/ratelimiter";
import { SystemNotificationsManager } from "../SytemNotificationsManager";
import { apiThrottler } from "@grammyjs/transformer-throttler";
import { run } from "@grammyjs/runner";
import { RabbitManager } from "../RabbitManager";
import { BotAirdropHelper } from "./helpers/BotAirdropHelper";
import { BotTokensHelper } from "./helpers/BotTokensHelper";

export class BotManager {
    botUsername: string;
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
        new BotReferralProgramHelper(),
        new BotUpgradeHelper(),
        new BotSettingsHelper(),
        new BotHelpHelper(),
        new BotNoneHelper(),
        new BotAdminHelper(),
        new BotAirdropHelper(),
        new BotTokensHelper(),
    ];
    static defaultBots: { [key: string]: string } = {}

    constructor(botUsername: string, botToken: string) {
        LogManager.log('BotManager', 'constructor', botUsername);

        LogManager.log('Starting bot...');
        this.botUsername = botUsername;
        this.bot = new Bot(botToken);

        this.bot.use(limit({
            timeFrame: 2000,
            limit: 3,
        
            onLimitExceeded: ctx => {
                LogManager.error('Rate limit exceeded for user', ctx.from?.id);
                SystemNotificationsManager.sendSystemMessage(`Rate limit exceeded for user ${ctx.from?.id} (@${ctx.from?.username})`);
            },
        
            // Note that the key should be a number in string format such as "123456789"
            keyGenerator: ctx => { return ctx.from?.id.toString() }
        }));

        const throttler = apiThrottler();
        this.bot.api.config.use(throttler);
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
                LogManager.log(`User ${ctx.myChatMember.from.id} (${ctx.myChatMember.from.username}) blocked bot ${botUsername}`);
                
                // handle user blocked bot
                if (botUsername){
                    const user = await UserManager.getUserByTelegramUser(ctx.myChatMember.from);
                    if (user) {
                        await BotManager.handleUserBlockedBot(user, botUsername);
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
    
        // this.bot.start();

        run(this.bot);

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

        if (!message.text){
            await BotManager.reply(ctx, `🔴 Unknown command`);
            return;
        }

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
        const tokens = await SearchManager.search(user.defaultChain || Chain.SOLANA, query, user.id);
        if (tokens.length > 0 && tokens[0].symbol && !TokenManager.excludedTokens.includes(tokens[0].address)){
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
        try {
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
        catch (e: any){
            if (e instanceof GrammyError && e.description == 'Forbidden: bot was blocked by the user'){
                const user = await UserManager.getUserById(data.userId);
                if (user){
                    await BotManager.handleUserBlockedBot(user, this.botUsername);
                }
            }
            else if (e instanceof GrammyError && e.description == 'Bad Request: wrong type of the web page content' && data.imageUrl){
                // if photo can't be sent, try to send message without photo. it's better than nothing
                data.imageUrl = undefined;
                await this.sendMessage(data);
            }
            //TODO: check for other errors. Like photo can't be sent, so send without photo
            else {
                LogManager.error('BotManager - error while sending message', e);
                throw e;
            }
        }
    }

    // -------- static --------
    static instances: BotManager[] = [];
    static async init(){
        const botUsernames = EnvManager.getBotUsernames();
        for (const botUsername of botUsernames) {
            await BotManager.getInstance(botUsername);
        }
    }
    static async getInstance(botUsername: string) {
        const instance = BotManager.instances.find(instance => instance.botUsername == botUsername);
        if (instance){
            return instance;
        }

        const botToken = EnvManager.getBotToken(botUsername);
        if (botToken){
            const instance = new BotManager(botUsername, botToken);
            BotManager.instances.push(instance);
            return instance;        
        }
    }

    static async sendMessage(data: SendMessageData){
        if (EnvManager.isTelegramProcess){
            const defaultBot = await this.getUserDefaultBot(data.userId);
            if (defaultBot){
                const botManager = await BotManager.getInstance(defaultBot);
                if (botManager){
                    await botManager.sendMessage(data);    
                }
            }
        }
        else {
            // await RabbitManager.publishTelegramMessage(data);
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

    static async editMessage(ctx: Context, text?: string, markup?: BotKeyboardMarkup, sourceMessageId?: number, sourceChatId?: number){
        try {
            const messageId = sourceMessageId || ctx?.message?.message_id || ctx?.update?.callback_query?.message?.message_id || ctx?.callbackQuery?.message?.message_id;
            const chatId = sourceChatId || ctx?.chat?.id || ctx?.update?.callback_query?.message?.chat?.id || ctx?.callbackQuery?.message?.chat?.id;
            if (chatId && messageId && text){
                const botUsername = BotManager.getBotUsername(ctx);
                const botManager = await BotManager.getInstance(botUsername);
                if (botManager){
                    await botManager.bot.api.editMessageText(chatId, messageId, text, { parse_mode: 'HTML', link_preview_options: {is_disabled: true}, reply_markup: markup });
                }
            }
        }
        catch (e: any){}
    }

    static async editMessageWithPhoto(ctx: Context, photo: string, text?: string, markup?: BotKeyboardMarkup, sourceMessageId?: number, sourceChatId?: number){
        try {
            const messageId = sourceMessageId || ctx?.message?.message_id || ctx?.update?.callback_query?.message?.message_id || ctx?.callbackQuery?.message?.message_id;
            const chatId = sourceChatId || ctx?.chat?.id || ctx?.update?.callback_query?.message?.chat?.id || ctx?.callbackQuery?.message?.chat?.id;
            if (chatId && messageId && text){
                const botUsername = BotManager.getBotUsername(ctx);
                const botManager = await BotManager.getInstance(botUsername);
                if (botManager){
                    await botManager.bot.api.editMessageMedia(chatId, messageId, {
                        type: 'photo',
                        caption: text,
                        media: photo,
                        parse_mode: 'HTML',
                    }, 
                    { 
                        reply_markup: markup 
                    });
                }
            }
        }
        catch (e: any){}
    }

    static async editMessageReplyMarkup(ctx: Context, markup?: BotKeyboardMarkup, sourceMessageId?: number, sourceChatId?: number){
        try {
            const messageId = sourceMessageId || ctx?.message?.message_id || ctx?.update?.callback_query?.message?.message_id || ctx?.callbackQuery?.message?.message_id;
            const chatId = sourceChatId || ctx?.chat?.id || ctx?.update?.callback_query?.message?.chat?.id || ctx?.callbackQuery?.message?.chat?.id;
            if (chatId && messageId){
                const botUsername = BotManager.getBotUsername(ctx);
                const botManager = await BotManager.getInstance(botUsername);
                if (botManager){
                    await botManager.bot.api.editMessageReplyMarkup(chatId, messageId, { reply_markup: markup });
                }
            }
        }
        catch (e: any){}
    }

    static async deleteMessage(ctx: Context, sourceMessageId?: number, sourceChatId?: number){
        try {
            const messageId = sourceMessageId || ctx?.message?.message_id || ctx?.update?.callback_query?.message?.message_id || ctx?.callbackQuery?.message?.message_id;
            const chatId = sourceChatId || ctx?.chat?.id || ctx?.update?.callback_query?.message?.chat?.id || ctx?.callbackQuery?.message?.chat?.id;

            if (chatId && messageId){
                const botUsername = BotManager.getBotUsername(ctx);
                const botManager = await BotManager.getInstance(botUsername);
                if (botManager){
                    await botManager.bot.api.deleteMessage(chatId, messageId);
                }
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
        const mintInfo = await SolanaManager.getTokenMint(token.chain, token.address);
        const kSOL = getNativeToken(token.chain);
        const currencySymbol = currency == Currency.SOL ? kSOL.symbol : currency;

        const buttons: InlineButton[] = [
            { id: `buy|${token.chain}|${token.address}|refresh`, text: '↻ Refresh' },
            { id: 'row', text: '' },
        ];



        for (const amount of buyAmounts) {
            buttons.push({ id: `buy|${token.chain}|${token.address}|${amount}`, text: `Buy ${amount} ${currencySymbol}` });
        }
        buttons.push({ id: `buy|${token.chain}|${token.address}|X`, text: `Buy X ${currencySymbol}` });

        let message = `<b>${token.symbol}</b> (${token.name})`;

        const dexscreenerUrl = ExplorerManager.getDexscreenerTokenUrl(token.address, token.chain);
        if (dexscreenerUrl){
            message += ` ᐧ <a href="${dexscreenerUrl}">📈</a>`;
        }

        const bubblemapsUrl = ExplorerManager.getBubblemapsTokenUrl(token.address, token.chain);
        if (bubblemapsUrl){
            message += ` ᐧ <a href="${bubblemapsUrl}">🫧</a>`;
        }

        if (token.chain != Chain.SOLANA){
            message += ` — 🔗 ${ChainManager.getChainTitle(token.chain)}`;
        }

        message += '\n';
        message += `<code>${token.address}</code>`;
        if (user.referralCode){
            const reflink = ExplorerManager.getTokenReflink(token.address, user.referralCode, botUsername);
            message += `\n<a href="${reflink}">Share token with your Reflink</a>`;    
        }

        if (mintInfo){
            message += `\n\n⚙️ Security:`;
            message += `\n├ Mint Authority: ${mintInfo.mintAuthority ? `Yes 🔴` : 'No 🟢'}`;
            message += `\n└ Freeze Authority: ${mintInfo.freezeAuthority ? `Yes 🔴` : 'No 🟢'}`;    
        }
        
        let solBalance: TokenBalance | undefined = undefined;
        if (traderProfile && traderProfile.encryptedWallet?.publicKey){
            const walletAddress = traderProfile.encryptedWallet.publicKey;
            solBalance = await SolanaManager.getWalletSolBalance(token.chain, walletAddress);
            const tokenBalance = await SolanaManager.getWalletTokenBalance(token.chain, walletAddress, token.address);

            message += '\n\n';
            message += `Balance: ${solBalance?.uiAmount || 0} ${kSOL.symbol}`;
            if (tokenBalance && tokenBalance.uiAmount>0){
                message += ` | ${tokenBalance.uiAmount} ${token.symbol}`;

                buttons.push({ id: 'row', text: '' });
                for (const amount of sellAmounts) {
                    buttons.push({ id: `sell|${token.chain}|${token.address}|${amount}`, text: `Sell ${amount}%` });
                }
                buttons.push({ id: `sell|${token.chain}|${token.address}|X`, text: `Sell X%` });
            }
            message += ` — <b>${traderProfile.title}</b> ✏️`;

            if (token.chain == Chain.SOLANA){
                const lpBalances = await TraderProfilesManager.fetchTokenLpMintBalance(token.chain, SwapDex.RAYDIUM_AMM, token.address, walletAddress);
                if (lpBalances && lpBalances.balances.length > 0){
                    const solBalance = lpBalances.balances.find(b => b.mint == kSolAddress);
                    const tokenBalance = lpBalances.balances.find(b => b.mint == token.address);
                    const usdValue = (tokenBalance?.uiAmount || 0) * (token.price || 0) + (solBalance?.uiAmount || 0) * TokenManager.getNativeTokenPrice(token.chain);

                    if (solBalance?.uiAmount || tokenBalance?.uiAmount){
                        const solBalanceString = Helpers.prettyNumberFromString('' + (solBalance?.uiAmount || 0), 3);
                        const tokenBalanceString = Helpers.prettyNumberFromString('' + (tokenBalance?.uiAmount || 0), 3);

                        message += `\nLP: ${tokenBalanceString} ${token.symbol} + ${solBalanceString} ${kSOL.symbol} = $${Helpers.numberFormatter(usdValue, 2)}`;

                        let btnIndex = 0;
                        for (const amount of sellAmounts) {
                            if (btnIndex % 2 == 0){ buttons.push({ id: 'row', text: '' }); }

                            buttons.push({ id: `sell_lp|${token.chain}|${token.address}|${amount}`, text: `Sell (LP) ${amount}%` });
                            btnIndex++;                    
                        }
                        if (btnIndex % 2 == 0){ buttons.push({ id: 'row', text: '' }); }
                        buttons.push({ id: `sell_lp|${token.chain}|${token.address}|X`, text: `Sell (LP) X%` });
                    }
                }
            }
        }

        const metricsMessage = BotManager.buildTokenMetricsMessage(token);
        if (metricsMessage){
            message += '\n\n';
            message += metricsMessage;
        }

        if (traderProfile && traderProfile.encryptedWallet?.publicKey){
            if (!solBalance || solBalance.uiAmount < 0.01){
                message += `\n\n🔴 Send some ${kSOL.symbol} to your trading wallet to ape into memes and cover gas fee.`;                
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
        let tokensMessage = '';
        if (token.symbol && !TokenManager.excludedTokens.includes(token.address)){
            tokensMessage += `<b>#${token.symbol}</b>`;
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

            tokensMessage += '\n';
            tokensMessage += `CA: <code>${token.address}</code>`;
        }

        return tokensMessage;
    }

    static async buildPortfolioMessage(user: IUser, traderProfile: IUserTraderProfile, botUsername: string): Promise<{  message: string, markup?: BotKeyboardMarkup }> {
        const chain = user.defaultChain || Chain.SOLANA;
        const { values, assets, lpAssets, warning } = await ChainManager.getPortfolio(chain, traderProfile);
        const kSOL = getNativeToken(chain);

        let message = `<b>${traderProfile.title}</b>${traderProfile.default?' ⭐️':''}`;
        if (chain != Chain.SOLANA){
            message += ` — 🔗 ${ChainManager.getChainTitle(chain)}`;
        }
        message += `\n<code>${traderProfile.encryptedWallet?.publicKey}</code> (Tap to copy)`; 

        if (warning){
            message += `\n\n⚠️ ${warning.message}`;
        }

        if (chain==Chain.SOLANA &&  values){
            message += `\n\nTotal value: $${values.totalPrice}`;
            if (values.pnl){
                message += `\nP&L: $${values.pnl}`;
            }
        }

        if (assets.length == 0 && lpAssets.length == 0){
            message += `\n\nNo assets on this wallet`;
        }
        else {
            if (assets.length > 0){
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

            if (lpAssets.length > 0){
                message += `\n\nLP Assets:`;
                for (const asset of lpAssets) {
                    const solBalance = asset.lpAmounts?.find(a => a.mint == kSolAddress)?.uiAmount || 0;
                    const tokenBalance = asset.lpAmounts?.find(a => a.mint == asset.address)?.uiAmount || 0;

                    const solBalanceString = Helpers.prettyNumberFromString('' + solBalance, 3);
                    const tokenBalanceString = Helpers.prettyNumberFromString('' + tokenBalance, 3);

                    message += `\n${asset.symbol} LP: ${tokenBalanceString} ${asset.symbol} + ${solBalanceString} ${kSOL.symbol}`;

                    if (asset.priceInfo?.totalPrice){
                        message += ` = $${Helpers.numberFormatter(asset.priceInfo.totalPrice, 2)}`;
                    }

                    if (asset.address != kSolAddress){
                        message += ` <a href="${ExplorerManager.getTokenReflink(asset.address, undefined, botUsername)}">[Sell]</a>`;
                    }
                }
            }
        }

        return { message, markup: undefined };
    }
     
    static async getUserDefaultBot(userId: string): Promise<string | undefined> {
        if (this.defaultBots[userId]){
            return this.defaultBots[userId];
        }

        try {
            const size = Object.keys(this.defaultBots).length;
            console.log('getUserDefaultBot', 'this.defaultBots size =', size);
        }
        catch (e: any){
            console.log('getUserDefaultBot', 'this.defaultBots size error', e);
        }

        const user = await UserManager.getUserById(userId);
        if (user && user.defaultBot){
            this.defaultBots[userId] = user.defaultBot;
            return user.defaultBot;
        }
    }

    static async handleUserBlockedBot(user: IUser, botUsername: string){
        LogManager.log('handleUserBlockedBot', user.id, botUsername);

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