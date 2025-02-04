import { createClient, RedisClientType } from "redis";
import { IUserTransaction } from "../../entities/users/UserTransaction";
import { kAddUniqueTransactionLua } from "./RedisScripts";

export class RedisManager {

    client?: RedisClientType;

    constructor(){
        RedisManager.instance = this;
    }

    async connect(){
        this.client = createClient({
            url: process.env.REDIS_CONNECTION_URL
        });   
        this.client.on('error', (err: Error) => console.log('Redis Client Error', err));

        await this.client.connect();
    }

    async setValue(key: string, value: string): Promise<boolean>{
        if (this.client){
            console.log('RedisManager', 'setValue', key, value);
            const res = await this.client.set(key, value);    
            return res ? true : false;
        }
        return false;
    }

    async getValue(key: string): Promise<string | null>{
        if (!this.client) return null;
        return await this.client.get(key);
    }

    // ### static methods

    static instance?: RedisManager;
    static getInstance(): RedisManager | undefined {
        return this.instance;
    }

    // ### static methods, specific to the application

    static async saveUserTransaction(tx: IUserTransaction): Promise<boolean> {
        try {
            const redis = RedisManager.getInstance()
            if(!redis) return false;
            if (!redis.client) return false;

            const userId = tx.userId;
            const signature = tx.signature;

            const signaturesKey = `user:${userId}:signatures`;
            const transactionsKey = `user:${userId}:transactions`;
        
            const result = (await redis.client.eval(kAddUniqueTransactionLua, {
            keys: [signaturesKey, transactionsKey],
            arguments: [signature, JSON.stringify(tx)],
            })) as number;

            return result === 1;
        } catch (err) {
            console.error('Error saving user transaction:', err);
            return false;
        }
    }

    /**
     * Get the (up to) 100 most recent transactions for a user
     */
    static async getTransactions(userId: string): Promise<any[] | undefined> {
        const redis = RedisManager.getInstance()
        if(!redis) return undefined;
        if (!redis.client) return undefined;

        const key = `user:${userId}:transactions`;
    
        // If using LPUSH, index 0 is the newest transaction
        // If using RPUSH, index -1 is the newest
        // but usually just get the whole list (0 to -1 or 0 to 99 if you want to limit).
        return await redis.client.lRange(key, 0, -1);
    }

}