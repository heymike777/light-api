import { createClient, RedisClientType } from "redis";
import { IUserTransaction, userTransactionFromJson } from "../../entities/users/UserTransaction";
import { kAddUniqueTransactionLua } from "./RedisScripts";
import { UserManager } from "../UserManager";
import { IToken } from "../../entities/tokens/Token";
import { LogManager } from "../LogManager";
import { IWallet } from "../../entities/Wallet";
import { WalletManager } from "../WalletManager";
import { Helpers } from "../../services/helpers/Helpers";

export interface WalletEvent {
    instanceId?: string;
    type: 'add' | 'delete';
    wallet: IWallet;
}

export class RedisManager {

    client?: RedisClientType;
    subscriber?: RedisClientType;
    publisher?: RedisClientType;
    instanceId = Helpers.makeid(8);

    constructor(){
        RedisManager.instance = this;
    }

    async connect(){
        this.client = createClient({
            url: process.env.REDIS_CONNECTION_URL
        });   
        this.client.on('error', (err: Error) => console.log('Redis Client Error', err));

        await this.client.connect();

        this.subscriber = this.client.duplicate();
        this.subscriber.on('error', (err: Error) => console.log('Redis Subscriber Error', err));
        await this.subscriber.connect();

        await this.subscriber.subscribe('wallets', this.onWalletChangedEvent);    

        this.publisher = this.client.duplicate();
        this.publisher.on('error', (err: Error) => console.log('Redis Publisher Error', err));
        await this.publisher.connect();
    }

    // ### wallets

    static async publishWalletEvent(event: WalletEvent){
        try {
            const redis = RedisManager.getInstance()
            if (!redis) throw new Error('Redis is not exist');

            if (redis.publisher){
                event.instanceId = redis.instanceId;
                await redis.publisher.publish('wallets', JSON.stringify(event));
            }    
        }
        catch(err){
            LogManager.error('RedisManager', 'publishWalletEvent', err);
        }
    }

    async onWalletChangedEvent(message: string){
        try{
            console.log('onWalletChangedEvent', 'message:', message);
            const event: WalletEvent = JSON.parse(message);
            const redis = RedisManager.getInstance();
            if (event.instanceId === redis?.instanceId) return;

            if (event.type === 'add'){
                // add wallet to cache
                WalletManager.addWalletToCache(event.wallet, false);
            }
            else if (event.type === 'delete'){
                // remove wallet from cache
                WalletManager.removeWalletFromCache(event.wallet, false);
            }
        }
        catch(err){
            LogManager.error('RedisManager', 'onWalletChangedEvent', err);
        }
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
        try {
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
        }
        catch(e){
            LogManager.error('getToken', e);
        }

        return [];    
    }

    static async cleanUserTransactions(userId: string) {
        try {
            const redis = RedisManager.getInstance()
            if (!redis) throw new Error('Redis is not exist');
            if (!redis.client) throw new Error('Redis client is not exist');
            if (!redis.client.isReady) throw new Error('Redis client is not ready');

            const signaturesKey = `user:${userId}:signatures`;
            const transactionsKey = `user:${userId}:transactions`;
        
            // remove signaturesKey and transactionsKey from redis
            await redis.client.del(signaturesKey);
            await redis.client.del(transactionsKey);
        } catch (err) {
            console.error('Error cleaning user transactions:', err);
        }
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

        try {
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
        catch(e){
            LogManager.error('getToken', e);
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

        try {
            const key = `token:sol:${token.address}`;
            const result = await redis.client.set(key, JSON.stringify(token));
            return result ? true : false;
        }
        catch(e){
            LogManager.error('getToken', e);
        }

        return false;
    }

    static async getToken(mint: string): Promise<IToken | undefined> {
        const redis = RedisManager.getInstance();
        if (!redis) return undefined;
        if (!redis.client) return undefined;
        if (!redis.client.isReady) return undefined;

        try {
            const key = `token:sol:${mint}`;
            const token = await redis.client.get(key);
            if (token) {
                return JSON.parse(token);
            }
        }
        catch(e){
            LogManager.error('getToken', e);
        }

        return undefined;
    }

    static async getTokens(mints: string[]): Promise<IToken[]> {
        console.log('RedisManager', 'getTokens', mints);

        const redis = RedisManager.getInstance();
        if (!redis) return [];
        if (!redis.client) return [];
        if (!redis.client.isReady) return [];

        try {
            const uniqueMints = Array.from(new Set(mints));
            const keys = mints.map(mint => `token:sol:${mint}`)
            console.log('RedisManager', 'keys', keys);

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
        }
        catch(e){
            LogManager.error('getToken', e);
        }

        return [];
    }

}