import { createClient, RedisClientType } from "redis";
import { IUserTransaction, userTransactionFromJson } from "../../entities/users/UserTransaction";
import { kAddUniqueTransactionLua } from "./RedisScripts";
import { UserManager } from "../UserManager";
import { IToken } from "../../entities/tokens/Token";

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
            if (!redis) throw new Error('Redis is not exist');
            if (!redis.client) throw new Error('Redis client is not exist');
            if (!redis.client.isReady) throw new Error('Redis client is not ready');

            const userId = tx.userId;
            const signature = tx.signature;

            const signaturesKey = `user:${userId}:signatures`;
            const transactionsKey = `user:${userId}:transactions`;
        
            const result = (await redis.client.eval(kAddUniqueTransactionLua, {
                keys: [signaturesKey, transactionsKey],
                arguments: [signature, `${tx.createdAt.getTime()/1000}`, JSON.stringify(tx)],
            })) as number;

            return result === 1;
        } catch (err) {
            console.error('Error saving user transaction:', err);
            return false;
        }
    }

    /**
     * Get most recent transactions for a user
     */
    static async getUserTransactions(userId: string): Promise<IUserTransaction[]> {
        const redis = RedisManager.getInstance();
        if (!redis) return [];
        if (!redis.client) return [];
        if (!redis.client.isReady) return [];

        const key = `user:${userId}:transactions`;

        // fetch the transactions from redis
        const transactions = await redis.client.lRange(key, 0, -1);
        if (transactions) {
            const userTransactions: IUserTransaction[] = [];
            transactions.forEach((tx: string) => {
                const userTx = userTransactionFromJson(tx);
                if (userTx) userTransactions.push(userTx);
            });
            return userTransactions;
        }

        return [];    
    }

    static async migrateAllUsersTransactionsToMongo() {
        const redis = RedisManager.getInstance();
        if (!redis) return [];
        if (!redis.client) return [];
        if (!redis.client.isReady) return [];

        // fetch all the keys
        const keys = await redis.client.keys('user:*:transactions');
        if (keys) {
            console.log('migrateAllUsersTransactionsToMongo', 'keys:', keys);
            for (const key of keys) {
                const userId = key.split(':')[1];
                await RedisManager.migrateUserTransactionsToMongo(userId);
            }
        }
    }

    /**
     * Get most recent transactions for a user
     */
    static async migrateUserTransactionsToMongo(userId: string) {
        const redis = RedisManager.getInstance();
        if (!redis) return [];
        if (!redis.client) return [];
        if (!redis.client.isReady) return [];

        const key = `user:${userId}:transactions`;
        console.log('migrateUserTransactionsToMongo', key);

        // fetch the transactions from redis
        const transactions = await redis.client.lRange(key, 0, -1);
        if (transactions && transactions.length > 0) {
            for (const txString of transactions) {
                try{
                    const tx = userTransactionFromJson(txString);
                    if (tx) {
                        await tx.save();

                        console.log('migrateUserTransactionsToMongo', tx.signature, 'success');

                        redis.client.lRem(key, 0, txString);
                    }
                }
                catch(e){
                    console.error('migrateUserTransactionsToMongo', e);
                }
            }

            await UserManager.cleanOldUserTransactions(userId);
        }
    }

    static async saveToken(token: IToken): Promise<boolean> {
        const redis = RedisManager.getInstance();
        if (!redis) return false;
        if (!redis.client) return false;
        if (!redis.client.isReady) return false;

        if (!token.symbol){
            console.error('saveToken', 'token.symbol is missing', token);
            return false;
        }

        const key = `token:sol:${token.address}`;
        const result = await redis.client.set(key, JSON.stringify(token));
        return result ? true : false;
    }

    static async getToken(mint: string): Promise<IToken | undefined> {
        const redis = RedisManager.getInstance();
        if (!redis) return undefined;
        if (!redis.client) return undefined;
        if (!redis.client.isReady) return undefined;

        const key = `token:sol:${mint}`;
        const token = await redis.client.get(key);
        if (token) {
            return JSON.parse(token);
        }

        return undefined;
    }

    static async getTokens(mints: string[]): Promise<IToken[]> {
        const redis = RedisManager.getInstance();
        if (!redis) return [];
        if (!redis.client) return [];
        if (!redis.client.isReady) return [];

        const uniqueMints = Array.from(new Set(mints));
        const keys = mints.map(mint => `token:sol:${uniqueMints}`)
        const tokens = await redis.client.mGet(keys);
        if (tokens) {
            const results: IToken[] = [];
            tokens.forEach((token: string | null) => {
                if (token) {
                    const parsed = JSON.parse(token);
                    results.push(parsed);
                }
            });
            return results;
        }

        return [];
    }

}