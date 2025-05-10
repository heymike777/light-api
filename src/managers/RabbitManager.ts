import amqp, { Channel, ChannelModel, Connection, ConsumeMessage } from "amqplib";
import { SendMessageData } from "./bot/BotTypes";
import { BotManager } from "./bot/BotManager";

export class RabbitManager {

    static conn: ChannelModel | undefined = undefined;
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

    static async getRabbit(): Promise<ChannelModel | undefined> {
        if (this.conn) return this.conn;
        if (!process.env.AMQP_URL) return undefined;

        const url = process.env.AMQP_URL!;
        this.conn = await amqp.connect(url, {
            heartbeat: 30,
            clientProperties: { connection_name: "telegram‑service" },
        });

        process.once("SIGINT", async () => {
            console.log("!Rabbit - SIGINT received, closing Rabbit connection");
            await this.conn?.close();
            process.exit(0);
        });

        this.conn.on("error", (err) => {
            console.error("!Rabbit - AMQP connection error", err);
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
                    if (err) console.error("broker nacked message", err);
                }
            );

            if (!ok) await new Promise((res) => ch.once("drain", res));
        }
        catch (e){
            console.error('Rabbit - publishTelegramMessage', 'error:', e);
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
            this.receivedMessage(msg, ch);
        });
    }

    static async receivedMessage(msg: ConsumeMessage, ch: Channel){
        try {
            const payload: SendMessageData = JSON.parse(msg.content.toString());
            console.log("Rabbit - TG message received:", payload);
            
            if (this.cachedMessages[payload.id]) {
                console.log("Rabbit - message already processed, skipping", payload.id);
                ch.ack(msg);
                return;
            }
            this.cachedMessages[payload.id] = new Date();
            await BotManager.sendMessage(payload);

            ch.ack(msg);
        } 
        catch (e) {
            console.error("bad message, moving to DLQ", e);
            ch.nack(msg, false, false); // dead‑letter instead of requeue
        }
    }

}