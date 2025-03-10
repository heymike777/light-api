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
import { Chain } from "../../services/solana/types";
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
import { IToken, ITokenModel } from "../../entities/tokens/Token";
import { TraderProfilesManager } from "../TraderProfilesManager";
import { IUserTraderProfile } from "../../entities/users/TraderProfile";

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
                await ctx.answerCallbackQuery(); // remove loading animation
            }
            else {
                //TODO: buy / sell tokens
                console.log('!mike', 'BUY/SELL', 'data:', ctx.callbackQuery.data);

                const data = ctx.callbackQuery.data.split('_');
                if (data.length < 2){
                    LogManager.error('Unknown button event with payload', ctx.callbackQuery.data);
                    await ctx.answerCallbackQuery(); // remove loading animation
                    return;
                }

                const chain = data[0];
                const command = data[1];
                if (chain == Chain.SOLANA){
                    if (command == 'trade'){
                        if (data.length < 2){
                            LogManager.error('Unknown button event with payload', ctx.callbackQuery.data);
                            await ctx.answerCallbackQuery(); // remove loading animation
                            return;
                        }

                        const mint = data[2];
                        LogManager.log('trade', mint, 'by', ctx.callbackQuery.from.username);

                        //TODO: send message with this token info and buttons to buy/sell

                        await ctx.answerCallbackQuery(); // remove loading animation
                        return;
                    }
                    else if (command == 'buy'){
                        if (data.length < 3){
                            LogManager.error('Unknown button event with payload', ctx.callbackQuery.data);
                            await ctx.answerCallbackQuery(); // remove loading animation
                            return;
                        }

                        const mint = data[2];
                        const amount = data[3];
                        LogManager.log('buy', mint, 'for', amount, 'SOL', 'by', ctx.callbackQuery.from.username);

                        //TODO: buy token

                        await ctx.answerCallbackQuery(); // remove loading animation
                        return;
                    }
                }

                LogManager.log("Unknown button event with payload", ctx.callbackQuery.data);
                await ctx.answerCallbackQuery(); // remove loading animation
            }

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

        const tokens = await SearchManager.search(message.text, user.id);
        if (tokens.length > 0){
            const traderProfile = await TraderProfilesManager.getUserDefaultTraderProfile(user.id);
            const { message, markup } = await BotManager.buildBuyMessageForToken(tokens[0], user, traderProfile);
            await BotManager.reply(ctx, message, { 
                parse_mode: 'HTML', 
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
                await botManager.bot.api.editMessageText(chatId, messageId, text, { parse_mode: 'HTML', reply_markup: markup });
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

            return await ctx.reply(text, { reply_markup: markup });
        }
        catch (e: any){
            LogManager.error('BotManager Error while replying', e);
        }
    }

    static async buildBuyMessageForToken(token: ITokenModel, user: IUser, traderProfile?: IUserTraderProfile): Promise<{  message: string, markup?: BotKeyboardMarkup }> {


        const buttons: InlineButton[] = [
            { id: `buy|${token.chain}|${token.address}|refresh`, text: '↻ Refresh' },
            { id: 'row', text: '' },
            { id: `buy|${token.chain}|${token.address}|0.5`, text: 'Buy 0.5 SOL' },
            { id: `buy|${token.chain}|${token.address}|1`, text: 'Buy 1 SOL' },
            { id: `buy|${token.chain}|${token.address}|x`, text: 'Buy X SOL' },
        ];
        const markup = BotManager.buildInlineKeyboard(buttons);
        const message = `Buy <b>${token.symbol}</b> (${token.name})`;
        return { message, markup };
    }
     

}