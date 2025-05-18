import Client, { SubscribeRequest, CommitmentLevel, txEncode, SubscribeUpdateTransactionInfo, SubscribeUpdate } from "@triton-one/yellowstone-grpc";
import base58 from 'bs58';
import { Helpers } from '../../helpers/Helpers';
import { WalletManager } from '../../../managers/WalletManager';
import { SystemNotificationsManager } from "../../../managers/SytemNotificationsManager";
import { MixpanelManager } from "../../../managers/MixpanelManager";
import { LogManager } from "../../../managers/LogManager";
import { EnvManager } from "../../../managers/EnvManager";
import { MicroserviceManager } from "../../../managers/MicroserviceManager";
import { Chain } from "../types";

export enum TxFilter {
    ALL_TRANSACTIONS = 'all_transactions',
}

export class YellowstoneManager {
    id: string;
    GRPC_URL: string;
    X_TOKEN: string;
    PING_INTERVAL_MS = 30_000; // 30s
    stream: any;

    static allWalletsPubKeys: string[] = [];
    static reloadAllWallets(): string[] {
        const accountInclude: string[] = [...WalletManager.walletsMap.keys()];
        // accountInclude.push('DpVH8xQZ4aapxwZ6KW9nuEUs9zEePa8HQvXny9Ajj93T'); // JUP BUYBACK token account
        YellowstoneManager.allWalletsPubKeys = accountInclude;
        return accountInclude;
    }

    constructor(id: string, grpcUrl: string, xToken: string){
        this.id = id;
        this.GRPC_URL = grpcUrl;
        this.X_TOKEN = xToken;
    }

    async init(){
        LogManager.log(process.env.SERVER_NAME, 'YellowstoneManager init', this.GRPC_URL, this.X_TOKEN);
        const client = new Client(this.GRPC_URL, this.X_TOKEN, {
            "grpc.max_receive_message_length": 64 * 1024 * 1024, // 64MiB
        });
    
        const stream = await client.subscribe();
        this.stream = stream;

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
    
        stream.on("data", (data: SubscribeUpdate) => {
            const filter = data.filters[0];

            if (filter == TxFilter.ALL_TRANSACTIONS) {
                YellowstoneManager.receivedTx(this.id, data.transaction?.transaction);
            } 
            else if (data.pong) {
                // LogManager.log(process.env.SERVER_NAME, `Processed ping response!`);
            }
        });

        await this.subscribeToPingPong(stream);
        await this.subscribeToConfirmedTransactions(stream);

        await streamClosed;
    }

    async onError(error: any){
        LogManager.error(process.env.SERVER_NAME, 'YellowstoneManager onError', error);
        await Helpers.sleep(5);
        
        YellowstoneManager.reloadInstance(this.id);
    }

    async subscribeToConfirmedTransactions(stream: any){
        LogManager.log(process.env.SERVER_NAME, `YellowstoneManager subscribeToConfirmedTransactions`);

        const accountInclude = YellowstoneManager.reloadAllWallets();
        LogManager.forceLog(process.env.SERVER_NAME, `YellowstoneManager subscribeToConfirmedTransactions`, accountInclude);

        if (accountInclude.length == 0){
            SystemNotificationsManager.sendSystemMessage('🔴🔴🔴 No wallets to subscribe (grpc)');
            MixpanelManager.trackError(undefined, { text: 'No wallets to subscribe (grpc)' });
            return;
        }

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
            "commitment": CommitmentLevel.CONFIRMED,
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
            LogManager.error('YellowstoneManager catch reason:', reason);
            throw reason;
        });
    }

    async subscribeToPingPong(stream: any){
        LogManager.log(process.env.SERVER_NAME, `YellowstoneManager subscribeToPingPong`);
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
        const intervalId = setInterval(async () => {
            if (stream.writable){
                await new Promise<void>((resolve, reject) => {
                    stream.write(pingRequest, (err: any) => {
                        if (err === null || err === undefined) {
                            resolve();
                        } else {
                            reject(err);
                        }
                    });
                }).catch((reason) => {
                    LogManager.error('pingpong error(catched):', reason);
                    // throw reason;
                });
            }
            else {
                clearInterval(intervalId);
            }
        }, this.PING_INTERVAL_MS);
    }

    static async receivedTx(geyserId: string, data?: SubscribeUpdateTransactionInfo){
        try {
            if (!data || !data.transaction || data.meta?.err){
                return;
            }


            const signature = base58.encode(data.signature);
            // console.log('YellowstoneManager receivedTx', signature);

            const jsonParsed = txEncode.encode(data, txEncode.encoding.JsonParsed, 255, true);
            const jsonParsedAny: any = jsonParsed;

            // check if this tx contains any tracking wallets
            const pubkeys = [
                ...(jsonParsed?.transaction?.message?.accountKeys?.map((key: any) => {
                    return key.pubkey;
                }) || []),
                ...(jsonParsed?.meta?.preTokenBalances?.map((b: any) => {
                    return b.owner;
                }) || []),
                ...(jsonParsed?.meta?.postTokenBalances?.map((b: any) => {
                    return b.owner;
                }) || []),
            ];
            console.log('YellowstoneManager receivedTx', 'jsonParsed:', JSON.stringify(jsonParsed));
            if (!pubkeys || pubkeys.length == 0){
                return;
            }
            const geyserWallets = YellowstoneManager.allWalletsPubKeys.filter((pubkey) => {
                return pubkeys.includes(pubkey);
            });
            // console.log('YellowstoneManager receivedTx', 'geyserWallets:', geyserWallets);
            if (geyserWallets.length == 0){
                return;
            }

            // check if this transaction is already processed by this server
            const shouldProcess = YellowstoneManager.shouldProcessSignature(signature);
            if (!shouldProcess){
                return;
            }

            MicroserviceManager.receivedTx(geyserId, signature, JSON.stringify(jsonParsedAny));
        }
        catch (e: any){
            LogManager.error(process.env.SERVER_NAME, 'YellowstoneManager receivedTx', 'error', e);
        }
    }

    // ### static methods

    static instances?: YellowstoneManager[];
    static createInstances(){
        if (!this.instances){
            this.instances = [];
        }

        YellowstoneManager.reloadAllWallets();

        if (process.env.SOLANA_GEYSER_RPC_1_NAME && process.env.SOLANA_GEYSER_RPC_1 && process.env.SOLANA_GEYSER_X_TOKEN_1){
            const listener = new YellowstoneManager(process.env.SOLANA_GEYSER_RPC_1_NAME, process.env.SOLANA_GEYSER_RPC_1, process.env.SOLANA_GEYSER_X_TOKEN_1);
            listener.init();
            this.instances.push(listener);
        }

        if (process.env.SOLANA_GEYSER_RPC_2_NAME && process.env.SOLANA_GEYSER_RPC_2 && process.env.SOLANA_GEYSER_X_TOKEN_2){
            const listener = new YellowstoneManager(process.env.SOLANA_GEYSER_RPC_2_NAME, process.env.SOLANA_GEYSER_RPC_2, process.env.SOLANA_GEYSER_X_TOKEN_2);
            listener.init();
            this.instances.push(listener);
        }

        if (process.env.SOLANA_GEYSER_RPC_3_NAME && process.env.SOLANA_GEYSER_RPC_3 && process.env.SOLANA_GEYSER_X_TOKEN_3){
            const listener = new YellowstoneManager(process.env.SOLANA_GEYSER_RPC_3_NAME, process.env.SOLANA_GEYSER_RPC_3, process.env.SOLANA_GEYSER_X_TOKEN_3);
            listener.init();
            this.instances.push(listener);
        }
    }

    static reloadInstance(id: string): YellowstoneManager | undefined {
        if (!this.instances){
            return undefined;
        }

        const listener = this.instances.find((instance) => instance.id === id);
        if (!listener){
            return undefined;
        }

        listener.init();
    }

    static async resubscribeAll(){
        console.log('YellowstoneManager resubscribeAll', 'isGeyserProcess:', EnvManager.isGeyserProcess);
        YellowstoneManager.reloadAllWallets();

        if (EnvManager.isGeyserProcess && EnvManager.chain == Chain.SOLANA){
            if (!this.instances){
                return;
            }

            for (const instance of this.instances){
                await instance.subscribeToConfirmedTransactions(instance.stream);
                await Helpers.sleep(1);
            }
        }
        else {
            await MicroserviceManager.geyserResubscribe();
        }
    }

    static processedSignatures: { [key: string]: number } = {};
    static processedSignaturesTimestamps: { [key: string]: number } = {};

    static shouldProcessSignature(signature: string){
        this.processedSignatures[signature] = ++this.processedSignatures[signature] || 1;

        // LogManager.log(`count`, this.processedSignatures[signature]);
        if (this.processedSignatures[signature] > 1){
            return false;
        }

        this.processedSignaturesTimestamps[signature] = Date.now();
        return true;
    }

    static cleanupProcessedSignatures(){
        const now = Date.now();
        for (const signature in this.processedSignaturesTimestamps){
            if (now - this.processedSignaturesTimestamps[signature] > 1000 * 60 * 10){
                delete this.processedSignatures[signature];
                delete this.processedSignaturesTimestamps[signature];
            }
        }
    }

    static jsonToGeyserTx(jsonString: string) {
        const geyserData = JSON.parse(jsonString);
        
        geyserData.transaction.transaction.signature = Buffer.from(geyserData.transaction.transaction.signature);
        const signatures: Buffer[] = [];
        for (const signature of geyserData.transaction.transaction.transaction.signatures){
            signatures.push(Buffer.from(signature));
        }
        geyserData.transaction.transaction.transaction.signatures = signatures;

        const accountKeys: Buffer[] = [];
        for (const accountKey of geyserData.transaction.transaction.transaction.message.accountKeys){
            accountKeys.push(Buffer.from(accountKey));
        }
        geyserData.transaction.transaction.transaction.message.accountKeys = accountKeys;

        for (const instruction of geyserData.transaction.transaction.transaction.message.instructions){
            if (instruction.data) instruction.data = Buffer.from(instruction.data);
            if (instruction.accounts) instruction.accounts = instruction.accounts.data;
        }

        geyserData.transaction.transaction.transaction.message.recentBlockhash = Buffer.from(geyserData.transaction.transaction.transaction.message.recentBlockhash);

        return geyserData;
    }


}