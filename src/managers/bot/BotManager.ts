import { Bot, Context, GrammyError, HttpError, InlineKeyboard } from "grammy";
import { IMessage, Message } from "../../entities/Message";
import { BotAddWalletHelper } from "./helpers/BotAddWalletHelper";
import { BotHelper } from "./helpers/BotHelper";
import { BotStartHelper } from "./helpers/BotStartHelper";
import { BotRemoveWalletHelper } from "./helpers/BotRemoveWalletHelper";
import { BotMyWalletsHelper } from "./helpers/BotMyWalletsHelper";
import { UserManager } from "../UserManager";
import { IUser } from "../../entities/users/User";
import { autoRetry } from "@grammyjs/auto-retry";
import { InlineKeyboardMarkup } from "grammy/types";
import { ExplorerManager } from "../../services/explorers/ExplorerManager";
import { Chain } from "../../services/solana/types";
import { LogManager } from "../LogManager";
import { EnvManager } from "../EnvManager";
import { MicroserviceManager } from "../MicroserviceManager";
import { BotConnectEmailHelper } from "./helpers/BotConnectEmailHelper";

export interface SendMessageData {
    chatId: number;
    text?: string;
    imageUrl?: string;
    inlineKeyboard?: InlineKeyboardMarkup;
}

export enum InlineKeyboardType {
    TOKEN_TX = 'token_tx',
}

export const kAdminUsernames = [
    'heymike777'
]

export interface TgMessage {
    message_id: number;
    from: {
        id: number;
        is_bot: boolean;
        first_name?: string;
        last_name?: string;
        username?: string;
        language_code?: string;
        is_premium?: boolean;
    };
    chat: {
        id: number;
        first_name?: string;
        username?: string;
        type: string;
    };
    voice?: {
        duration: number;
        mime_type: string;
        file_id: string;
        file_unique_id: string;
        file_size: number;
    };
    document?: {
        file_id: string;
        file_unique_id: string;
        thumb: {
            file_id: string;
            file_unique_id: string;
            file_size: number;
            width: number;
            height: number;
        };
        thumbnail: {
            file_id: string;
            file_unique_id: string;
            file_size: number;
            width: number;
            height: number;
        };
        file_name: string;
        mime_type: string;
        file_size: number;
    };
    photo?: {
        file_id: string;
        file_unique_id: string;
        file_size: number;
        width: number;
        height: number;
    }[];
    date: number;
    text: string;
    entities: any[];
}

export interface InlineButton {
    id: string;
    text: string;
    link?: string;
}

export class BotManager {
    bot: Bot;
    helpers: BotHelper[] = [
        new BotStartHelper(),
        new BotAddWalletHelper(),
        new BotRemoveWalletHelper(),
        new BotMyWalletsHelper(),
        new BotConnectEmailHelper(),
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

        // this.bot.on("message:left_chat_member:me", async (ctx) => {
        //     LogManager.log('Bot left chat', ctx.chat.id);
        // });

        this.bot.on("callback_query:data", async (ctx) => {
            const buttonId = ctx.callbackQuery.data;
            console.log('Button clicked', buttonId);
            const user = await UserManager.getUserByTelegramUser(ctx.callbackQuery.from);

            // await UserManager.updateTelegramState(user.id, undefined); // reset user's state

            const helper = await this.findHelperByCommand(buttonId);
            if (helper && ctx.chat){
                // this.saveMessageToDB({
                //     message_id: 0,
                //     chat: ctx.chat,
                //     from: ctx.callbackQuery.from,
                //     text: `/${buttonId}`,
                //     date: Date.now(),
                //     entities: [],
                // });

                helper.commandReceived(ctx, user);
                await ctx.answerCallbackQuery(); // remove loading animation
            }
            else {
                // buy / sell tokens
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

        if (message.from.username && kAdminUsernames.includes(message.from.username)){
            if (message.voice){
                ctx.reply('File ID (audio): ' + message.voice.file_id);
            }
            if (message.document){
                ctx.reply('File ID (document): ' + message.document.file_id);
            }
            if (message.photo){
                // find the biggest photo
                let biggestPhoto = message.photo[0];
                for (const photo of message.photo){
                    if (photo.width > biggestPhoto.width){
                        biggestPhoto = photo;
                    }
                }
                ctx.reply('File ID (photo): ' + biggestPhoto.file_id);
            }
        }

        const user = await UserManager.getUserByTelegramUser(message.from, true);

        await this.saveMessageToDB(message);
        
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

        const lastMessage = await Message.findOne({chatId: message.chat.id}).sort({createdAt: -1});//TODO: don't rely on last message. better save user's state in User
        if (!lastMessage){
            // do nothing?
            return;
        }

        LogManager.log('lastMessage', lastMessage.data.text);

        const lastMessageCommand = lastMessage.data.text.startsWith('/') ? lastMessage.data.text.substring(1) : undefined;
        if (lastMessageCommand){
            const helper = await this.findHelperByCommand(lastMessageCommand);
            if (helper){
                const success = await helper.messageReceived(message, ctx, user);
                if (success){
                    return;
                }
            }
        }

        await UserManager.updateTelegramState(user.id, undefined); // reset user's state, if no found helper
        //...

    }

    async findHelperByCommand(command: string): Promise<BotHelper | undefined> {
        if (command.startsWith('start')){
            return this.helpers.find(helper => helper.kCommand == 'start');
        }

        return this.helpers.find(helper => helper.kCommand == command);
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
            this.bot.api.sendPhoto(data.chatId, data.imageUrl, {
                caption: data.text,
                parse_mode: 'HTML', 
                reply_markup: data.inlineKeyboard,
            });    
        }
        else {
            this.bot.api.sendMessage(data.chatId, data.text || '', {
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

    static buildInlineKeyboard(buttons: InlineButton[]): InlineKeyboardMarkup | undefined {
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

    static buildInlineKeyboardForToken(chain: Chain, type: InlineKeyboardType, mint: string, tokenName: string): InlineKeyboardMarkup | undefined {
        if (chain == Chain.SOLANA){
            if (type == InlineKeyboardType.TOKEN_TX){
                const inlineKeyboard = new InlineKeyboard()
                    .text(`Trade ${tokenName}`, `${chain}_trade_${mint}`)
                    .url(`Explorer`, ExplorerManager.getUrlToAddress(mint));
                return inlineKeyboard;
            }
            else {
                LogManager.error('Unknown inline keyboard type', type);
            }
        }

        return undefined;
    }

}