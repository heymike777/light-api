import amqp, { Channel, ChannelModel, ConsumeMessage } from "amqplib";
import { SendMessageData } from "./bot/BotTypes";
import { BotManager } from "./bot/BotManager";
import { Client, Offset } from "rabbitmq-stream-js-client";
import { HealthManager } from "./HealthManager";
import { LogManager } from "./LogManager";

export class RabbitManager {

    // static conn: ChannelModel | undefined = undefined;
    static client: Client | undefined = undefined;
    static cachedMessages: { [key: string]: Date } = {};

    static cleanCache() {
        const now = new Date();
        for (const key in this.cachedMessages) {
            const date = this.cachedMessages[key];
            if (date && (now.getTime() - date.getTime()) > 1000 * 60 * 5) {
                delete this.cachedMessages[key];
            }
        }
    }

    static async getRabbit(): Promise<Client | undefined> {
        if (this.client) return this.client;
        
        this.client = await Client.connect({
            hostname: "localhost",
            port: 5552,
            username: "guest",
            password: "guest",
            vhost: "/",
        });

        console.log("RabbitMQ: Making sure the stream exists...");
        const streamSizeRetention = 5 * 1e9
        await this.client.createStream({ stream: 'light-telegram', arguments: { "max-length-bytes": streamSizeRetention } });
        
        return this.client;
    }

    static async publishTelegramMessage(msg: SendMessageData) {
        try {
            console.log('Rabbit - publishTelegramMessage', msg);
            const rabbitStreamClient = await this.getRabbit();
            if (!rabbitStreamClient){
                return;
            }

            const publisher = await rabbitStreamClient.declarePublisher({ stream: 'light-telegram' });
            await publisher.send(Buffer.from(JSON.stringify(msg)));
        }
        catch (e){
            LogManager.error('Rabbit - publishTelegramMessage', 'error:', e);
        }
    }

    static async listenToTelegramMessages() {
        console.log("Rabbit - listening to telegram messages");
        const rabbitStreamClient = await this.getRabbit();
        if (!rabbitStreamClient){
            return;
        }
        
        await rabbitStreamClient.declareConsumer({ stream: 'light-telegram', offset: Offset.first() }, (message) => {
            console.log(`RabbitMQ: Received message ${message.content.toString()}`)
            try {
                const payload: SendMessageData = JSON.parse(message.content.toString());
                this.receivedMessage(payload);
            }
            catch (e) {
                LogManager.error("Rabbit - error parsing message", e);
            }
        });
    }

    static async receivedMessage(payload: SendMessageData){
        HealthManager.telegramMessagesCount++;
        
        try {            
            if (this.cachedMessages[payload.id]) {
                console.log("Rabbit - message already processed, skipping", payload.id);
                return;
            }

            this.cachedMessages[payload.id] = new Date();
            await BotManager.sendMessage(payload);
        } 
        catch (e) {
            LogManager.error("RabbitManager receivedMessage error:", e);
        }
    }

    /*
    static async getRabbit(): Promise<ChannelModel | undefined> {
        if (this.conn) return this.conn;
        if (!process.env.AMQP_URL) return undefined;

        const url = process.env.AMQP_URL!;
        this.conn = await amqp.connect(url, {
            heartbeat: 30,
            clientProperties: { connection_name: "telegram‑service" },
        });

        // process.once("SIGINT", async () => {
        //     console.log("!Rabbit - SIGINT received, closing Rabbit connection");
        //     await this.conn?.close();
        //     process.exit(0);
        // });

        this.conn.on("error", (err) => {
            LogManager.error("!Rabbit - AMQP connection error", err);
            this.conn = undefined; // trigger reconnect on next call
        });

        return this.conn;
    }

    static async publishTelegramMessage(msg: SendMessageData) {
        try {
            console.log('Rabbit - publishTelegramMessage', msg);
            const rabbitConnection = await this.getRabbit();
            if (!rabbitConnection){
                return;
            }
            const ch = await rabbitConnection.createConfirmChannel(); // guaranteed acks

            const exchange = "telegram-messages";
            await ch.assertExchange(exchange, "fanout", { durable: true });

            const ok = ch.publish(
                exchange,
                "",
                Buffer.from(JSON.stringify(msg)),
                { persistent: true },
                (err) => {
                    if (err) LogManager.error("broker nacked message", err);
                }
            );

            if (!ok) await new Promise((res) => ch.once("drain", res));
        }
        catch (e){
            LogManager.error('Rabbit - publishTelegramMessage', 'error:', e);
        }
    }

    static async listenToTelegramMessages() {
        console.log("Rabbit - listening to telegram messages");
        const rabbitConnection = await this.getRabbit();
        if (!rabbitConnection){
            return;
        }
        const ch = await rabbitConnection.createChannel();
        const queue = "telegram-messages.q";

        await ch.assertExchange("telegram-messages", "fanout", { durable: true });
        await ch.assertQueue(queue, { durable: true });
        await ch.bindQueue(queue, "telegram-messages", "");

        ch.prefetch(8); // at most 8 un‑acked messages

        await ch.consume(queue, (msg) => {
            if (!msg) return;
            try {
                const payload: SendMessageData = JSON.parse(msg.content.toString());
                this.receivedMessage(payload, msg, ch);
            }
            catch (e) {
                LogManager.error("Rabbit - error parsing message", e);
                ch.nack(msg, false, false); // dead‑letter instead of requeue
            }
        });
    }

    static async receivedMessage(payload: SendMessageData, msg?: ConsumeMessage, ch?: Channel){
        try {
            if (ch && msg) console.log("Rabbit - TG message received:", payload);
            
            if (this.cachedMessages[payload.id]) {
                console.log("Rabbit - message already processed, skipping", payload.id);
                if (ch && msg) ch.nack(msg, false, false);
                return;
            }
            this.cachedMessages[payload.id] = new Date();
            await BotManager.sendMessage(payload);

            if (ch && msg) ch.ack(msg);
        } 
        catch (e) {
            LogManager.error("bad message, moving to DLQ", e);
            if (ch && msg) ch.nack(msg, false, false); // dead‑letter instead of requeue
        }
    }
    */

}