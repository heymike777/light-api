import { Bot } from "grammy";
import { kAddWalletReplyMessage, kStartCommandReplyMessage } from "../constants/Messages";
import { IMessage, Message } from "../entities/Message";
import { kAddWalletCommand, kRemoveWalletCommand, kStartCommand } from "../constants/Commands";
import { WalletManager } from "../managers/WalletManager";
import { SolanaManager } from "./solana/SolanaManager";

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

    constructor() {
        console.log('BotManager', 'constructor');

        console.log('Starting bot...');
        this.bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);
    
        // this.bot.command('start', (ctx) => {
        //     this.onCommand('start', ctx);
        // });

        // this.bot.command('add_wallet', (ctx) => {
        //     this.onCommand('add_wallet', ctx);
        // });

        // this.bot.command('remove_wallet', (ctx) => {
        //     this.onCommand('remove_wallet', ctx);
        // });

        this.bot.on('message', (ctx) => {
            this.onMessage(ctx.update.message as TgMessage, ctx);
        });
    
        this.bot.start();
        console.log('Bot started!');    
    }

    async onCommand(command: string, ctx: any){
        if (command == 'start'){
            ctx.reply(kStartCommandReplyMessage.text);
        }
        else if (command == 'add_wallet'){
            ctx.reply(kAddWalletReplyMessage.text);
        }
        else if (command == 'remove_wallet'){
            ctx.reply(kAddWalletReplyMessage.text);
        }
    }

    async onMessage(message: TgMessage, ctx: any){
        console.log('onMessage', message);

        const lastMessage = await Message.findOne({chatId: message.chat.id}).sort({createdAt: -1});

        await this.saveMessageToDB(message);        

        if (message.text == '/' + kStartCommand){
            this.onCommand(kStartCommand, ctx);
            return;
        }
        else if (message.text == '/' + kAddWalletCommand){
            this.onCommand(kAddWalletCommand, ctx);
            return;
        }
        else if (message.text == '/' + kRemoveWalletCommand){
            this.onCommand(kRemoveWalletCommand, ctx);
            return;
        }

        if (!lastMessage){
            // do nothing?
            return;
        }

        console.log('lastMessage', lastMessage.data.text);

        if (lastMessage.data.text == '/' + kAddWalletCommand){
            console.log('add wallets', message.text);

            const lines = message.text.split('\n');
            const wallets: {address: string, title?: string}[] = [];
            for (let line of lines) {
                line = line.trim();
                if (line.length == 0){
                    continue;
                }
                const parts = line.split(' ');
                const walletAddress = parts.shift();
                let title = parts.length>0 ? parts.join(' ') : undefined;
                title = title?.trim();
                if (title?.length == 0){
                    title = undefined;
                }

                if (!walletAddress){
                    continue;
                }

                if (SolanaManager.isValidPublicKey(walletAddress) == false){
                    ctx.reply('Invalid wallet address: ' + walletAddress);
                    continue;
                }

                wallets.push({address: walletAddress, title: title});                
            }

            for (const wallet of wallets) {
                await WalletManager.addWallet(message.chat.id, wallet.address, wallet.title);
            }

            if (wallets.length == 0){
                ctx.reply('No wallets found!');
                return;
            }
            else if (wallets.length == 1){
                ctx.reply('Wallet saved! We will start tracking it in 2-3 minutes.');
                return;
            }
            else {
                ctx.reply(`${wallets.length} wallets saved! We will start tracking them in 2-3 minutes.`);
                return;
            }
        }

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