import Client, { SubscribeRequest, CommitmentLevel } from "@triton-one/yellowstone-grpc";
import base58 from 'bs58';
import { Helpers } from '../../helpers/Helpers';
import { WalletManager } from '../../../managers/WalletManager';
import { TxParser } from "./TxParser";
import fs from "fs";

export enum TxFilter {
    ALL_TRANSACTIONS = 'all_transactions',
}

export class YellowstoneManager {
    GRPC_URL = process.env.SOLANA_GEYSER_RPC!;
    X_TOKEN = process.env.SOLANA_GEYSER_X_TOKEN!;
    PING_INTERVAL_MS = 30_000; // 30s

    constructor() {
    }

    async init(){
        console.log(new Date(), process.env.SERVER_NAME, 'YellowstoneManager init', this.GRPC_URL, this.X_TOKEN);
        const client = new Client(this.GRPC_URL, this.X_TOKEN, {
            "grpc.max_receive_message_length": 64 * 1024 * 1024, // 64MiB
        });
    
        const stream = await client.subscribe();
    
        const streamClosed = new Promise<void>((resolve, reject) => {
            stream.on("error", (error) => {
                reject(error);
                stream.end();
                // this.onError(error);
            });
            stream.on("end", () => {
                resolve();
                this.onError('stream end');
            });
            stream.on("close", () => {
                resolve();
                // this.onError('stream close');
            });
        });
    
        stream.on("data", (data) => {
            const filter = data.filters[0];

            if (filter == TxFilter.ALL_TRANSACTIONS) {
                this.receivedTx(data, filter);
            } 
            else if (data.pong) {
                // console.log(new Date(), process.env.SERVER_NAME, `Processed ping response!`);
            }
        });

        await this.subscribeToPingPong(stream);
        await this.subscribeToConfirmedTransactions(stream);

        await streamClosed;
    }

    async onError(error: any){
        console.error(new Date(), process.env.SERVER_NAME, 'YellowstoneManager onError', error);
        await Helpers.sleep(5);
        
        YellowstoneManager.getInstance(true);
    }

    async subscribeToConfirmedTransactions(stream: any){
        console.log(new Date(), process.env.SERVER_NAME, `YellowstoneManager subscribeToConfirmedTransactions`);

        const accountInclude = process.env.ENVIROMENT === 'DEVELOPMENT' ? [
            'FUCww3SgAmqiP4CswfgY2r2Nsf6PPzARrXraEnGCn4Ln',
            '9Xt9Zj9HoAh13MpoB6hmY9UZz37L4Jabtyn8zE7AAsL'
        ] : [];

        const request: SubscribeRequest = {
            "transactions": {
                "all_transactions": {
                    failed: false,
                    vote: false,
                    accountInclude: accountInclude,
                    accountExclude: [],
                    accountRequired: [],
                }
            },
            "commitment": CommitmentLevel.PROCESSED,
            "entry": {},
            "slots": {},
            "accounts": {},
            "transactionsStatus": {},
            "blocks": {},
            "blocksMeta": {},
            "accountsDataSlice": [],
        };
        
        await new Promise<void>((resolve, reject) => {
            stream.write(request, (err: any) => {
                if (err === null || err === undefined) {
                    resolve();
                } else {
                    reject(err);
                }
            });
        }).catch((reason) => {
            console.error(reason);
            throw reason;
        });
    }

    async subscribeToPingPong(stream: any){
        console.log(new Date(), process.env.SERVER_NAME, `YellowstoneManager subscribeToPingPong`);
        // Send pings every 5s to keep the connection open
        const pingRequest: SubscribeRequest = {
            ping: { id: 1 },
            // Required, but unused arguments
            accounts: {},
            accountsDataSlice: [],
            transactions: {},
            transactionsStatus: {},
            blocks: {},
            blocksMeta: {},
            entry: {},
            slots: {},
        };
        setInterval(async () => {
            await new Promise<void>((resolve, reject) => {
                stream.write(pingRequest, (err: any) => {
                    if (err === null || err === undefined) {
                        resolve();
                    } else {
                        reject(err);
                    }
                });
            }).catch((reason) => {
                console.error(reason);
                // throw reason;
            });
        }, this.PING_INTERVAL_MS);
    }

    async receivedTx(data: any, filter: string){
        const transaction = data.transaction.transaction;
        if (transaction.meta.err){ return; }

        const signature = base58.encode(transaction.signature);
        fs.appendFile('transactions.txt', `${new Date()} ${signature}\n`, (err) => {
            if (err) console.error(err);
        });


        const parsedTransactionWithMeta = await TxParser.parseGeyserTransactionWithMeta(data);
        if (parsedTransactionWithMeta){
            WalletManager.processWalletTransaction(parsedTransactionWithMeta);
        }
        // console.log(new Date(), process.env.SERVER_NAME, `receivedTx(${YellowstoneManager.txCount})`, signature);       
        // const signature = base58.encode(transaction.signature);
        // WalletManager.processWalletTransactionBySignature(signature);
    }

    // ### static methods

    static instance?: YellowstoneManager;
    static getInstance(forceCreate: boolean = false): YellowstoneManager | undefined {
        if (!this.instance || forceCreate){
            this.instance = new YellowstoneManager();
            this.instance.init();
        }
        return this.instance;
    }

}