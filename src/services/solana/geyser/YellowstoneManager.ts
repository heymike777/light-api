import { kProgramIdRaydium, kPumpfunLiquidityWalletAddress, kRaydiumAuthority, kSolAddress } from './../Constants';
import Client, { SubscribeRequest, CommitmentLevel } from "@triton-one/yellowstone-grpc";
import base58 from 'bs58';
import { ConfirmedTransaction, TokenBalance } from '@triton-one/yellowstone-grpc/dist/grpc/solana-storage';
import { Helpers } from '../../helpers/Helpers';
import { HeliusManager } from '../HeliusManager';
import { WalletManager } from '../../../managers/WalletManager';
// import { BuySellResult, TradingManager } from '../../TradingManager';

export enum TxFilter {
    RAYDIUM = 'raydium',
    PUMPFUN = 'pumpfun',
    WALLETS = 'wallets',
    ALL_TRANSACTIONS = 'all_transactions',
}

export class YellowstoneManager {
    GRPC_URL = process.env.SOLANA_GEYSER_RPC!;
    X_TOKEN = process.env.SOLANA_GEYSER_X_TOKEN!;
    PING_INTERVAL_MS = 30_000; // 30s

    constructor() {
    }

    async init(){
        
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

            if (filter == TxFilter.RAYDIUM || filter == TxFilter.PUMPFUN) {
                this.receivedDexTx(data, filter);
            } 
            else if (filter == TxFilter.ALL_TRANSACTIONS) {
                this.receivedTx(data, filter);
            } 
            else if (data.pong) {
                // console.log(new Date(), process.env.SERVER_NAME, `Processed ping response!`);
            }
        });

        await this.subscribeToPingPong(stream);
        // await this.subscribeToProcessedTransactions(stream);
        await this.subscribeToConfirmedTransactions(stream);

        await streamClosed;
    }

    async onError(error: any){
        console.error(new Date(), process.env.SERVER_NAME, 'YellowstoneManager onError', error);
        await Helpers.sleep(5);
        
        YellowstoneManager.getInstance(true);
    }

    async subscribeToProcessedTransactions(stream: any){
        console.log(new Date(), process.env.SERVER_NAME, `YellowstoneManager subscribeToTransactions`);

        const raydiumRequest: SubscribeRequest = {
            "transactions": {
                "raydium": {
                    failed: false,
                    vote: false,
                    accountInclude: [kProgramIdRaydium, kPumpfunLiquidityWalletAddress],
                    accountExclude: [],
                    accountRequired: [],
                },
                "pumpfun": {
                    failed: false,
                    vote: false,
                    accountInclude: [kPumpfunLiquidityWalletAddress],
                    accountExclude: [kProgramIdRaydium],
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
            stream.write(raydiumRequest, (err: any) => {
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

    async subscribeToConfirmedTransactions(stream: any){
        console.log(new Date(), process.env.SERVER_NAME, `YellowstoneManager subscribeToConfirmedTransactions`);

        const request: SubscribeRequest = {
            "transactions": {
                "all_transactions": {
                    failed: false,
                    vote: false,
                    accountInclude: [],
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
                throw reason;
            });
        }, this.PING_INTERVAL_MS);
    }

    async receivedTx(data: any, filter: string){
        const transaction = data.transaction.transaction;
        if (transaction.meta.err){ return; }

        const signature = base58.encode(transaction.signature);
        const parsedTransaction = ConfirmedTransaction.fromJSON(data.transaction.transaction);
        console.log(new Date(), process.env.SERVER_NAME, 'receivedWalletTx', signature);       

        WalletManager.processWalletTransaction(signature, parsedTransaction);
    }

    async receivedDexTx(data: any, filter: string){
        const transaction = data.transaction.transaction;
        if (transaction.meta.err){ return; }

        const signature = base58.encode(transaction.signature);
        const parsedTransaction = ConfirmedTransaction.fromJSON(data.transaction.transaction);

        // this.processParsedTransaction(signature, parsedTransaction);
    }

    // async processParsedTransaction(signature: string, parsedTransaction: ConfirmedTransaction, logs: boolean = false) {
    //     try {
    //         const transaction = parsedTransaction.transaction;
    //         const meta = parsedTransaction.meta

    //         if (!transaction || !meta || !transaction.message){
    //             return;
    //         }
        
    //         const logMessages: string[] = meta.logMessages;
    //         const accounts = transaction.message.accountKeys.map((i: Uint8Array) => base58.encode(i))
    //         const signer = base58.encode(transaction.message.accountKeys[0]);

    //         // console.log(new Date(), process.env.SERVER_NAME, 'processParsedTransaction', signature, 'signer:', signer, 'accounts:', accounts, 'logMessages:', logMessages);


    //         let isRaydiumAddLP = false;
    //         let isPumpfunRemoveLP = false;
    //         for (const logMessage of logMessages){
    //             if (logMessage.includes('InitializeInstruction2') && accounts.includes(kRaydiumAuthority) && accounts.includes(kProgramIdRaydium)){
    //                 isRaydiumAddLP = true;
    //             }
                
    //             if (logMessage.includes('Instruction: Withdraw') && signer == kPumpfunLiquidityWalletAddress){
    //                 isPumpfunRemoveLP = true;
    //             }
    //         }

    //         if (isRaydiumAddLP){
    //             console.log(new Date(), process.env.SERVER_NAME, 'processParsedTransaction', signature, 'isRaydiumAddLP', 'parsedTransaction:', JSON.stringify(parsedTransaction));
    //             let lpSolAmount = 0;
    //             let baseMint: string | undefined = undefined;
    //             let baseMintDecimals: number | undefined = undefined;
    //             let lpMint: string | undefined = undefined;

    //             for (const tokenBalance of meta.postTokenBalances) {
    //                 if (tokenBalance.owner == kRaydiumAuthority){
    //                     if (tokenBalance.mint == kSolAddress){
    //                         lpSolAmount = tokenBalance.uiTokenAmount?.uiAmount || 0;
    //                     }
    //                     else {
    //                         // baseMintAmount = tokenBalance.uiTokenAmount?.uiAmount || 0;
    //                         baseMint = tokenBalance.mint;
    //                         baseMintDecimals = tokenBalance.uiTokenAmount?.decimals;
    //                     }
    //                 }
    //             }

    //             // we found baseMint, now we need to find lpMint
    //             for (const tokenBalance of meta.postTokenBalances) {
    //                 if (tokenBalance.mint != baseMint && tokenBalance.owner == signer){
    //                     lpMint = tokenBalance.mint;
    //                     break;
    //                 }
    //             }

    //             let poolId: string | undefined = undefined;

    //             for (const item of [...transaction.message.instructions, ...meta.innerInstructions.map((i: any) => i.instructions).flat()]) {
    //                 if (accounts[item.programIdIndex] !== kProgramIdRaydium) continue
                
    //                 if ([...(item.data as Buffer).values()][0] != 1) continue
                
    //                 const keyIndex = [...(item.accounts as Buffer).values()]

    //                 const expectedPoolId = accounts[keyIndex[4]];
    //                 console.log(new Date(), process.env.SERVER_NAME, 'processParsedTransaction', signature, 'keyIndex[4]:', keyIndex[4], 'expectedPoolId:', expectedPoolId);
    //                 poolId = expectedPoolId;
    //             }


    //             console.log(new Date(), process.env.SERVER_NAME, 'processParsedTransaction', signature, 'poolId:', poolId, 'baseMint:', baseMint, 'lpMint:', lpMint, 'lpSolAmount:', lpSolAmount);

    //             if (poolId && baseMint && lpMint && baseMintDecimals!=undefined){
    //                 await this.processRaydiumPool(poolId, baseMint, baseMintDecimals, lpMint, lpSolAmount, signer);
    //             }

    //             //!PumpfunToken.updateOne({mintAddress: baseMint}, {$set: {isListedOnRaydium: true}}).exec();
    //         }

    //         if (isPumpfunRemoveLP){
    //             console.log(new Date(), process.env.SERVER_NAME, 'processParsedTransaction', signature, 'isPumpfunRemoveLP', 'parsedTransaction:', JSON.stringify(parsedTransaction));
    //             let mint: string | undefined = undefined;
    //             for (const tokenBalance of meta.postTokenBalances) {
    //                 if (tokenBalance.owner == kPumpfunLiquidityWalletAddress){
    //                     if (tokenBalance.uiTokenAmount?.uiAmount == 206900000){
    //                         mint = tokenBalance.mint;
    //                     }
    //                 }
    //             }


    //             console.log(new Date(), process.env.SERVER_NAME, 'processParsedTransaction', signature, 'isPumpfunRemoveLP', 'mint:', mint);

    //             if (mint != undefined){
    //                 try {
    //                     // await PumpfunToken.create({
    //                     //     mintAddress: mint, 
    //                     //     isListedOnRaydium: false,
    //                     //     shouldSnipe: false,
    //                     //     createdAt: new Date(),
    //                     // });

    //                     // if (process.env.SERVER_NAME == 'sniper2'){
    //                     //     let message = `🔜🔜🔜🔜🔜🔜🔜\n[NEW PUMPFUN SOON]\n`;
    //                     //     message += `Mint: ${mint}\n`;
    //                     //     message += `Now: ${(new Date()).toUTCString()}\n`;
    //                     //     message += `Birdeye: https://birdeye.so/token/${mint}?chain=solana\n`;
    //                     //     message += `Pumpfun: https://pump.fun/${mint}\n`;
    //                     //     BotManager.sendMessageToPumpfunTokensAlerts(message);   
    //                     // } 
    //                 }
    //                 catch (err){
    //                     console.error(new Date(), process.env.SERVER_NAME, 'processParsedTransaction', 'PumpfunToken.create', 'Error:', err);
    //                 }
    //             }
    //         }

    //     }
    //     catch (err) {
    //         if (logs) console.error(new Date(), 'processTransaction', 'Error:', err);
    //     }
    // }

    // async processRaydiumPool(poolId: string, baseMint: string, baseMintDecimals: number, lpMint: string, solAmount: number, signer: string) {     
    //     try {

    //         if (solAmount < 5){
    //             console.log(new Date(), process.env.SERVER_NAME, 'processRaydiumPool', 'solAmount < 5', 'solAmount:', solAmount);
    //             return;
    //         }

    //         const isPumpfun = signer == kPumpfunLiquidityWalletAddress;
    //         if (isPumpfun){
    //             // if (process.env.SERVER_NAME == 'sniper1'){
    //             //     let msg1 = `🆕🆕🆕🆕🆕🆕🆕\n[NEW PUMPFUN TOKEN]\n`;
    //             //     msg1 += `Mint: ${baseMint} \n`;
    //             //     msg1 += `Now: ${(new Date()).toUTCString()}\n`;
    //             //     msg1 += `Pool ID: ${poolId} \n`;
    //             //     msg1 += `Pool: ${Helpers.numberFormatter(solAmount, 2)} SOL \n`;
    //             //     msg1 += `\n`;
    //             //     msg1 += `https://dexscreener.com/solana/${poolId} \n`;
    //             //     BotManager.sendMessageToPumpfunTokensAlerts(msg1);    
    //             // }
                
    //             // snipe pumpfun tokens here. Not wasting time to get other token info
    //             // const subscriptions = SubscriptionManager.subscriptions.filter(x => x.isPumpfun == true && (x.tokenAddress == baseMint || x.tokenAddress == undefined));
    //             // if (subscriptions.length > 0){
    //             //     for (const subscription of subscriptions){
    //             //         BotManager.sendSystemMessage(`Buy ${baseMint} (pumpfun), Delay: ${config.pumpfunDelay} sec`);

    //             //         if (config.pumpfunDelay > 0){
    //             //             await Helpers.sleep(config.pumpfunDelay);
    //             //         }
                        
    //             //         const mintAddress = baseMint;
                        
    //             //         const tokenName = '-';
    //             //         let result: BuySellResult | undefined;
    //             //         let triesCount = 5;
    //             //         while (triesCount > 0 && !result){
    //             //             result = await TradingManager.buy(mintAddress, poolId, tokenName, baseMintDecimals, subscription.autoBuySolAmount, TokenType.NORMAL, subscription.id);
    //             //             triesCount--;
    //             //             await Helpers.sleep(0.3); // 1s sleep
    //             //         }
    //             //     }
    //             // }
    //             // else {
    //             //     // BotManager.sendSystemMessage(`No subscriptions found for ${baseMint} (pumpfun)`);
    //             // }
    //         }
    
    //         const token = await HeliusManager.getFungibleAsset(baseMint);
    //         if (!token){
    //             console.error(new Date(), 'processRaydiumPool', 'Error: token from HeliusManager.getFungibleAsset is undefined');
    //             return;
    //         }
    //         console.log('!token', JSON.stringify(token));

    //         const isFrozen = token.token_info?.freeze_authority ? true : false;
    //         const isMintLocked = token.token_info?.mint_authority ? false : true;
    //         const isToken22 = token.mint_extensions ? true : false;            

    //         TokenManager.createToken(baseMint, baseMintDecimals, poolId, token.content.metadata.symbol, isFrozen, isToken22, lpMint);

    //         console.log(new Date(), process.env.SERVER_NAME, 'NEW MINTED TOKEN', 'mint:', baseMint, 'poolId:', poolId, 'isFrozen:', isFrozen, 'isMintLocked:', isMintLocked, 'isToken22:', isToken22);

    //         // snipe Honeypot tokens here. Not wasting time to get other token info
    //         if (!isToken22 && isFrozen){
    //             let message = `[NEW TOKEN] ${token.content.metadata.symbol} \n`;
    //             message += `Pool: ${Helpers.numberFormatter(solAmount, 2)} SOL \n`;
    //             message += `Mint: ${baseMint} \n`;
    //             message += `Pool ID: ${poolId} \n`;
    //             message += `\n`;
    //             message += `${!isMintLocked ? '🔴' : '🟢'} Mint locked: ${isMintLocked} \n`;
    //             message += `${isFrozen ? '🔴' : '🟢'} Has freeze authority: ${isFrozen} \n`;
    //             message += `${isToken22 ? '🔴' : '🟢'} Token22: ${isToken22} \n`;
    //             // message += `${!poolLocked ? '🟠' : '🟢'} Pool locked: ${poolLocked} \n`;
    //             message += `\n`;
    //             message += `https://dexscreener.com/solana/${poolId} \n`;
                    
    //             console.log('Telegram Message', message);
                
    //             if (process.env.ENVIRONMENT == 'PRODUCTION'){
    //                 if (process.env.SERVER_NAME == 'sniper1'){
    //                     BotManager.sendSystemMessage(message);
    //                 }
    //                 else if (process.env.SERVER_NAME == 'sniper2'){
    //                     BotManager.sendMessageToSolanaTokensAlerts(message);
    //                 }

    //                 // find subscriptions that match this token
    //                 const subscriptions = SubscriptionManager.subscriptions.filter(x => x.isHoneypot == true);
    //                 if (subscriptions.length > 0){
    //                     for (const subscription of subscriptions){
    //                         BotManager.sendSystemMessage(`Buy ${baseMint} ${token.content.metadata.symbol} (honeypot)`);
                            
    //                         const mintAddress = baseMint;
                            
    //                         const tokenName = token.content.metadata.symbol;
    //                         let result: BuySellResult | undefined;
    //                         let triesCount = 5;
    //                         while (triesCount > 0 && !result){
    //                             result = await TradingManager.buy(mintAddress, poolId, tokenName, baseMintDecimals, subscription.autoBuySolAmount, TokenType.HONEYPOT, subscription.id);
    //                             triesCount--;
    //                             await Helpers.sleep(1); // 1s sleep
    //                         }
    //                     }
    //                 }
    //                 else {
    //                     // BotManager.sendSystemMessage(`No subscriptions found for ${baseMint} ${token.content.metadata.symbol} (honeypot)`);
    //                 }
    //             }
    //         }

    //         if (!isPumpfun && !isToken22 && !isFrozen && solAmount <= 80){
    //             if (process.env.SERVER_NAME == 'sniper2'){
    //                 let msg1 = `🪙🪙🪙🪙🪙🪙🪙\n[NEW TOKEN, NOT HONEYPOT, NOT PUMPFUN]\n`;
    //                 msg1 += `Mint: ${baseMint} \n`;
    //                 msg1 += `Now: ${(new Date()).toUTCString()}\n`;
    //                 msg1 += `Pool ID: ${poolId} \n`;
    //                 msg1 += `Pool: ${Helpers.numberFormatter(solAmount, 2)} SOL \n`;
    //                 msg1 += `\n`;
    //                 msg1 += `https://dexscreener.com/solana/${poolId} \n`;
    //                 await BotManager.sendMessageToSolTokensAlerts(msg1);
    //             }

    //             // snipe pumpfun tokens here. Not wasting time to get other token info
    //             const subscriptions = SubscriptionManager.subscriptions.filter(x => x.isPumpfun == false && x.isHoneypot == false);
    //             if (subscriptions.length > 0){
    //                 for (const subscription of subscriptions){
    //                     BotManager.sendSystemMessage(`Buy ${baseMint} (normal)`);

    //                     // if (config.pumpfunDelay > 0){
    //                     //     await Helpers.sleep(config.pumpfunDelay);
    //                     // }
                        
    //                     const mintAddress = baseMint;
                        
    //                     const tokenName = '-';
    //                     let result: BuySellResult | undefined;
    //                     let triesCount = 5;
    //                     while (triesCount > 0 && !result){
    //                         result = await TradingManager.buy(mintAddress, poolId, tokenName, baseMintDecimals, subscription.autoBuySolAmount, TokenType.NORMAL, subscription.id);
    //                         triesCount--;
    //                         await Helpers.sleep(0.3); // 1s sleep
    //                     }
    //                 }
    //             }
    //         }

    //         // let poolLocked = false;
    //         // let poolState: any = null;
    //         // const info = await connection.getAccountInfo(new web3.PublicKey(poolId))
    //         // if (info?.data) {
    //         //     poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(info?.data)    
    //         //     poolLocked = await checkBurn(connection, poolState.lpMint, 'confirmed')    
    //         // }

    //         //TODO: snipe normal tokens, in case I need it in the future


    //         return
    //     } catch (e) {
    //         console.log(e)
    //         return null
    //     }
    // }

    // static deserializeRaydiumSwapTransaction(geyserTransaction: any, transactionStr: string, logs: boolean = false): DeserializedSwapTransaction | undefined {
    //     //TODO: possible improvement is that it could be not VersionedTrasaction, but normal Transaction

    //     try{
    //         if (logs) console.log(new Date(), process.env.SERVER_NAME, 'deserializeTransaction', transactionStr);

    //         const meta = geyserTransaction.params.result.transaction.meta;
    //         const preBalances = meta.preBalances;
    //         const postBalances = meta.postBalances;
    //         const preTokenBalances = meta.preTokenBalances;
    //         const postTokenBalances = meta.postTokenBalances;

    //         const swapTransactionBuf = Buffer.from(transactionStr, 'base64');
    //         const transaction = web3.VersionedTransaction.deserialize(swapTransactionBuf);
    //         if (logs) console.log(new Date(), process.env.SERVER_NAME, 'deserializeTransaction result:', transaction);

    //         const message = web3.TransactionMessage.decompile(transaction.message);
    //         if (logs) console.log(new Date(), process.env.SERVER_NAME, 'deserializeTransaction decompiled message:', message);

    //         const mainWallet = message.payerKey;
    //         const recentBlockhash = transaction.message.recentBlockhash;

    //         const staticAccountKeys = transaction.message.staticAccountKeys;
    //         let mainWalletIndex = -1;
    //         for (let i = 0; i < staticAccountKeys.length; i++){
    //             if (staticAccountKeys[i].equals(mainWallet)){
    //                 mainWalletIndex = i;
    //                 break;
    //             }
    //         }

    //         if (logs) console.log(new Date(), process.env.SERVER_NAME, 'deserializeTransaction mainWalletIndex:', mainWalletIndex);

    //         if (mainWalletIndex == -1){
    //             console.error(new Date(), 'deserializeTransaction', 'Error: mainWalletIndex is -1');
    //             return undefined;
    //         }

    //         const mainWalletPreTokenBalances = preTokenBalances.filter((x: any) => x.owner == mainWallet.toBase58() && x.mint != WSOL.mint);
    //         const mainWalletPostTokenBalances = postTokenBalances.filter((x: any) => x.owner == mainWallet.toBase58()  && x.mint != WSOL.mint);
    //         if (logs) console.log(new Date(), process.env.SERVER_NAME, 'deserializeTransaction', 'mainWalletPreTokenBalances:', mainWalletPreTokenBalances);
    //         if (logs) console.log(new Date(), process.env.SERVER_NAME, 'deserializeTransaction', 'mainWalletPostTokenBalances:', mainWalletPostTokenBalances);

    //         const wSolPreTokenBalance = preTokenBalances.find((x: any) => x.owner == mainWallet.toBase58() && x.mint == WSOL.mint);
    //         const wSolPostTokenBalance = postTokenBalances.find((x: any) => x.owner == mainWallet.toBase58()  && x.mint == WSOL.mint);
    //         const wSolBalanceChange = (wSolPreTokenBalance && wSolPostTokenBalance) ? (wSolPostTokenBalance.uiTokenAmount.amount - wSolPreTokenBalance.uiTokenAmount.amount) : 0;

    //         let solBalanceChange = postBalances[mainWalletIndex] - preBalances[mainWalletIndex];
    //         solBalanceChange += wSolBalanceChange;
    //         if (logs) console.log(new Date(), process.env.SERVER_NAME, 'deserializeTransaction', 'solBalanceChange:', solBalanceChange);            

    //         if (mainWalletPreTokenBalances.length!=1 || mainWalletPostTokenBalances.length!=1){
    //             console.error(new Date(), 'deserializeTransaction', 'Error: mainWalletPreTokenBalances.length!=1 || mainWalletPostTokenBalances.length!=1');
    //             return undefined;
    //         }
    //         if (mainWalletPreTokenBalances[0].mint != mainWalletPostTokenBalances[0].mint){
    //             console.error(new Date(), 'deserializeTransaction', 'Error: mainWalletPreTokenBalances[0].mint != mainWalletPostTokenBalances[0].mint');
    //             return undefined;
    //         }

    //         const type = solBalanceChange > 0 ? TransactionType.SELL : TransactionType.BUY;

    //         const mint = mainWalletPreTokenBalances[0].mint;
    //         const decimals = mainWalletPreTokenBalances[0].uiTokenAmount.decimals;
    //         const amount = mainWalletPostTokenBalances[0].uiTokenAmount.amount - mainWalletPreTokenBalances[0].uiTokenAmount.amount;
    //         const uiAmount = mainWalletPostTokenBalances[0].uiTokenAmount.uiAmount - mainWalletPreTokenBalances[0].uiTokenAmount.uiAmount;
            
    //         if (type == TransactionType.BUY){
    //             if (logs) console.log(new Date(), process.env.SERVER_NAME, '!!!', mainWallet.toBase58(), 'bought', uiAmount, 'tokens of', mint, 'for', -solBalanceChange/(10**9), 'SOL');
    //         }
    //         else {
    //             if (logs) console.log(new Date(), process.env.SERVER_NAME, '!!!', mainWallet.toBase58(), 'sold', uiAmount, 'tokens of', mint, 'for', solBalanceChange/(10**9), 'SOL');
    //         }

    //         let swap: RaydiumSwapInstructionData | undefined;
    //         const instructions = message.instructions;
    //         for (const instruction of instructions) {
    //             if (instruction.programId.toBase58() == kProgramIdRaydium){
    //                 if (logs) console.log(new Date(), process.env.SERVER_NAME, 'deserializeTransaction', 'Raydium instruction:', instruction);
    //                 const data = instruction.data;
    //                 swap = RaydiumManager.decodeRaydiumSwapInstruction(data);
    //                 if (logs) console.log(new Date(), process.env.SERVER_NAME, 'deserializeTransaction', 'Raydium swap:', swap);
    //             }
    //             else {
    //                 if (logs) console.log(new Date(), process.env.SERVER_NAME, 'deserializeTransaction', 'NOT Raydium Instruction');
    //             }
    //         }

    //         if (!swap){
    //             //TODO: save transaction id to the database, so we can check it later
    //             console.error(new Date(), 'deserializeTransaction', 'Error: swap is undefined');
    //             return undefined;
    //         }

    //         if (Math.abs(solBalanceChange) < 0.1 * web3.LAMPORTS_PER_SOL){
    //             if (logs) console.log(new Date(), process.env.SERVER_NAME, 'deserializeTransaction', 'solBalanceChange is too small:', solBalanceChange / web3.LAMPORTS_PER_SOL, 'SOL, no reason to process this transaction');
    //             return undefined;
    //         }

    //         return {transaction, message, recentBlockhash, feePayer: mainWallet, swap, mintAddress: mint, decimals, amount, solAmount: solBalanceChange, type};
    //     }
    //     catch (err) {
    //         //console.error(new Date(), 'deserializeTransaction', 'Error:', err);
    //     }
    //     return undefined;
    // }

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