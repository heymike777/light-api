import { Bot } from "grammy";
import { IMessage, Message } from "../../entities/Message";
import { BotAddWalletHelper } from "./helpers/BotAddWalletHelper";
import { BotHelper } from "./helpers/BotHelper";
import { BotStartHelper } from "./helpers/BotStartHelper";
import { BotRemoveWalletHelper } from "./helpers/BotRemoveWalletHelper";
import { BotMyWalletsHelper } from "./helpers/BotMyWalletsHelper";

export interface TgMessage {
    message_id: number;
    from: {
        id: number;
        is_bot: boolean;
        first_name: string;
        last_name: string;
        username: string;
        language_code: string;
        is_premium: boolean;
    };
    chat: {
        id: number;
        first_name: string;
        username: string;
        type: string;
    };
    date: number;
    text: string;
    entities: any[];
}

export class BotManager {
    bot: Bot;
    helpers: BotHelper[] = [
        new BotStartHelper(),
        new BotAddWalletHelper(),
        new BotRemoveWalletHelper(),
        new BotMyWalletsHelper(),
    ];

    constructor() {
        console.log('BotManager', 'constructor');

        console.log('Starting bot...');
        this.bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);
    
        this.bot.on('message', (ctx) => {
            this.onMessage(ctx.update.message as TgMessage, ctx);
        });
    
        this.bot.start();
        console.log('Bot started!');    
    }

    async onCommand(command: string, ctx: any){
        const helper = await this.findHelperByCommand(command);
        if (helper){
            helper.commandReceived(ctx);
        }
        else {
            console.error('Unknown command', command);
        } 
    }

    async onMessage(message: TgMessage, ctx: any){
        console.log('onMessage', message);

        const lastMessage = await Message.findOne({chatId: message.chat.id}).sort({createdAt: -1});

        await this.saveMessageToDB(message);
        
        if (message.text.startsWith('/')){
            const command = message.text.substring(1);
            this.onCommand(command, ctx);
            return;
        }

        if (!lastMessage){
            // do nothing?
            return;
        }

        console.log('lastMessage', lastMessage.data.text);

        const lastMessageCommand = lastMessage.data.text.startsWith('/') ? lastMessage.data.text.substring(1) : undefined;
        if (lastMessageCommand){
            const helper = await this.findHelperByCommand(lastMessageCommand);
            if (helper){
                helper.messageReceived(message, ctx);
                return;
            }
        }

        //...

    }

    async findHelperByCommand(command: string): Promise<BotHelper | undefined> {
        return this.helpers.find(helper => helper.kCommand == command);
    }

    async saveMessageToDB(message: TgMessage): Promise<IMessage> {
        const newMessage = new Message();
        newMessage.chatId = message.chat.id;
        newMessage.firstName = message.from.first_name;
        newMessage.lastName = message.from.last_name;
        newMessage.username = message.from.username;
        newMessage.isPremium = message.from.is_premium;
        newMessage.isBot = message.from.is_bot;
        newMessage.languageCode = message.from.language_code;
        newMessage.data = message;
        newMessage.createdAt = new Date();
        await newMessage.save();

        return newMessage;
    }

    async sendTextMessage(chatId: number, text: string){
        console.log('sendTextMessage', chatId, text);
        this.bot.api.sendMessage(chatId, text, {parse_mode: 'HTML'});
    }

    // -------- static --------
    static instance: BotManager | undefined = undefined;
    static async getInstance() {
        if (!BotManager.instance) {
            BotManager.instance = new BotManager();
        }
        return BotManager.instance;        
    }

    static async sendSystemMessage(text: string, chatId: number = +process.env.TELEGRAM_SYSTEM_CHAT_ID!){
        const botManager = await BotManager.getInstance();
        await botManager.sendTextMessage(chatId, text);
    }


}