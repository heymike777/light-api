import { Bot } from "grammy";
import { kStartMessage } from "../constants/Messages";

export interface TgMessage {
    message_id: number;
    from: {
        id: number;
        is_bot: boolean;
        first_name: string;
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

    constructor() {
        console.log('BotManager', 'constructor');

        console.log('Starting bot...');
        this.bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);
    
        this.bot.command("start", (ctx) => {
            console.log('Got start command! ctx', ctx);
            console.log('Got start command! message', JSON.stringify(ctx.update.message));
            // this.onMessage(ctx.update.message as TgMessage);
            ctx.reply(kStartMessage.text);
        });

        this.bot.on("message", (ctx) => {
            console.log('Got message! ctx', ctx);
            console.log('Got message! message', JSON.stringify(ctx.update.message));
            // this.onMessage(ctx.message as TgMessage);

            // ctx.reply("Hi, how can I help you?");
        });
    
        this.bot.start();
        console.log('Bot started!');    
    }

    // async onStart({}){
    // }

    // async onMessage(msg: TgMessage){
    //     console.log('onMessage', msg);
    // }

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