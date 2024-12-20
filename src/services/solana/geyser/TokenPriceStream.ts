import Client, { SubscribeRequest, CommitmentLevel } from "@triton-one/yellowstone-grpc";
import base58 from 'bs58';
import { Helpers } from '../../helpers/Helpers';
import { TxParser } from "./TxParser";
import { kProgram } from "../../../managers/constants/ProgramConstants";
import { ProgramManager } from "../../../managers/ProgramManager";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { BN } from "bn.js";

export class TokenPriceStream {
    id: string;
    GRPC_URL: string;
    X_TOKEN: string;
    PING_INTERVAL_MS = 30_000; // 30s
    stream: any;

    constructor(id: string, grpcUrl: string, xToken: string){
        this.id = id;
        this.GRPC_URL = grpcUrl;
        this.X_TOKEN = xToken;
    }

    async init(){
        console.log(new Date(), process.env.SERVER_NAME, 'TokenPriceStream init', this.GRPC_URL, this.X_TOKEN);
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
    
        stream.on("data", (data) => {
            const filter = data.filters[0];

            if (filter == 'jupiter') {
                this.receivedJupiterTx(data, filter);
            } 
            else if (data.pong) {
                // console.log(new Date(), process.env.SERVER_NAME, `Processed ping response!`);
            }
        });

        await this.subscribeToPingPong(stream);
        await this.subscribeToDexTransactions(stream);

        await streamClosed;
    }

    async onError(error: any){
        console.error(new Date(), process.env.SERVER_NAME, 'TokenPriceStream onError', error);
        await Helpers.sleep(5);
        
        TokenPriceStream.reloadInstance(this.id);
    }

    async subscribeToDexTransactions(stream: any){
        console.log(new Date(), process.env.SERVER_NAME, `TokenPriceStream subscribeToDexTransactions`);

        const request: SubscribeRequest = {
            "transactions": {
                "jupiter": {
                    failed: false,
                    vote: false,
                    accountInclude: [kProgram.JUPITER],
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
            console.error(reason);
            throw reason;
        });
    }

    async subscribeToPingPong(stream: any){
        console.log(new Date(), process.env.SERVER_NAME, `TokenPriceStream subscribeToPingPong`);
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
                    console.error('pingpong error(catched):', reason);
                    // throw reason;
                });
            }
            else {
                clearInterval(intervalId);
            }
        }, this.PING_INTERVAL_MS);
    }

    async receivedJupiterTx(data: any, filter: string){
        const transaction = data.transaction.transaction;
        if (transaction.meta.err){ return; }

        const signature = base58.encode(transaction.signature);

        // check if this transaction is already processed by this server
        const shouldProcess = TokenPriceStream.shouldProcessSignature(signature);
        if (!shouldProcess){
            return;
        }

        console.log(new Date(), process.env.SERVER_NAME, 'listener', this.id, `receivedJupiterTx`, signature);
        // fs.appendFile('transactions.txt', `${new Date()} ${signature}\n`, (err) => {
        //     if (err) console.error(err);
        // });

        const parsedTransactionWithMeta = await TxParser.parseGeyserTransactionWithMeta(data);
        if (parsedTransactionWithMeta && parsedTransactionWithMeta.meta){
            // WalletManager.processWalletTransaction(parsedTransactionWithMeta);
            //TODO: get token price from tx

            const signer = parsedTransactionWithMeta.transaction.message.accountKeys.find(account => account.signer);
            if (signer){
                const walletAddress = signer.pubkey.toBase58();
                const tokenBalanceChanges = ProgramManager.findChangedTokenBalances(walletAddress, parsedTransactionWithMeta.meta, false);
                if (tokenBalanceChanges.length == 1){
                    const tokenBalanceChange = tokenBalanceChanges[0];
                    const solBalanceChange = ProgramManager.findSolChange(walletAddress, parsedTransactionWithMeta);

                    if (solBalanceChange) {
                        const solDivMod = solBalanceChange.divmod(new BN(LAMPORTS_PER_SOL));
                        const solChange = solDivMod.div.toNumber() + solDivMod.mod.toNumber() / LAMPORTS_PER_SOL;
                        const tokenChange = tokenBalanceChange.uiAmountChange;
                        const solPrice = 180; // 1 SOL = $180
                        const tokenPrice = (solChange * solPrice / tokenChange); 
                        console.log('!jup', 'mint:', tokenBalanceChange.mint, 'balance:', tokenChange, 'sol:', solChange, 'price:', `$${tokenPrice.toFixed(6)}`);

                    }
    
                }
            }

    
        }
    }

    // ### static methods

    static instances?: TokenPriceStream[];
    static createInstances(){
        console.log(new Date(), process.env.SERVER_NAME, 'TokenPriceStream createInstances');

        if (!this.instances){
            this.instances = [];
        }

        if (process.env.SOLANA_GEYSER_RPC_1_NAME && process.env.SOLANA_GEYSER_RPC_1 && process.env.SOLANA_GEYSER_X_TOKEN_1){
            const listener = new TokenPriceStream(process.env.SOLANA_GEYSER_RPC_1_NAME, process.env.SOLANA_GEYSER_RPC_1, process.env.SOLANA_GEYSER_X_TOKEN_1);
            listener.init();
            this.instances.push(listener);
        }

        if (process.env.SOLANA_GEYSER_RPC_2_NAME && process.env.SOLANA_GEYSER_RPC_2 && process.env.SOLANA_GEYSER_X_TOKEN_2){
            const listener = new TokenPriceStream(process.env.SOLANA_GEYSER_RPC_2_NAME, process.env.SOLANA_GEYSER_RPC_2, process.env.SOLANA_GEYSER_X_TOKEN_2);
            listener.init();
            this.instances.push(listener);
        }

        if (process.env.SOLANA_GEYSER_RPC_3_NAME && process.env.SOLANA_GEYSER_RPC_3 && process.env.SOLANA_GEYSER_X_TOKEN_3){
            const listener = new TokenPriceStream(process.env.SOLANA_GEYSER_RPC_3_NAME, process.env.SOLANA_GEYSER_RPC_3, process.env.SOLANA_GEYSER_X_TOKEN_3);
            listener.init();
            this.instances.push(listener);
        }
    }

    static reloadInstance(id: string): TokenPriceStream | undefined {
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
        if (!this.instances){
            return;
        }

        for (const instance of this.instances){
            await instance.subscribeToDexTransactions(instance.stream);
            await Helpers.sleep(1);
        }
    }

    static processedSignatures: { [key: string]: number } = {};
    static processedSignaturesTimestamps: { [key: string]: number } = {};

    static shouldProcessSignature(signature: string){
        this.processedSignatures[signature] = ++this.processedSignatures[signature] || 1;

        console.log(`count`, this.processedSignatures[signature]);
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


}