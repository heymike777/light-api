import * as web3 from "@solana/web3.js";
import BN from 'bn.js';
import { AMM_STABLE, AMM_V4, AmmRpcData, AmmV4Keys, AmmV5Keys, ApiV3PoolInfoStandardItem, ComputeAmountOutParam, DEVNET_PROGRAM_ID, JupTokenType, Percent, Raydium, TokenAccount, TokenAccountRaw, TokenAmount, toToken, TxVersion } from "@raydium-io/raydium-sdk-v2";
import base58 from "bs58";
import * as spl from "@solana/spl-token";
import { Chain } from "./types";
import { newConnectionByChain } from "./lib/solana";
import { LogManager } from "../../managers/LogManager";
import { SendThrough, SolanaManager } from "./SolanaManager";
import { BadRequestError } from "../../errors/BadRequestError";
import { kSolAddress } from "./Constants";
import { MemoryManager } from "../../managers/MemoryManager";
import Decimal from "decimal.js";

const VALID_PROGRAM_ID = new Set([
    AMM_V4.toBase58(),
    AMM_STABLE.toBase58(),
    DEVNET_PROGRAM_ID.AmmV4.toBase58(),
    DEVNET_PROGRAM_ID.AmmStable.toBase58(),
])
  
export const isValidAmm = (id: string) => VALID_PROGRAM_ID.has(id)

export interface RaydiumSwapInstructionData {
    instructionType: number;

    amountIn?: BN;
    minAmountOut?: BN;

    maxAmountIn?: BN; 
    amountOut?: BN;
}

export type SwapInput = SwapInputIn | SwapInputOut;

export type SwapInputIn = {
    fixedSide: 'in',
    amountIn: BN,
    minAmountOut?: BN; 

    inputMint: string,
    poolId: string,
    slippage?: number, // slippage in percent

    shouldCloseAta?: boolean,
    shouldAddFakeTokenAccountForMintIn?: boolean,
    shouldAddTips?: boolean,
    blockhash?: string,

    poolInfoFromRpc?: {
        poolRpcData: AmmRpcData,
        poolInfo: ComputeAmountOutParam["poolInfo"],
        poolKeys: AmmV4Keys | AmmV5Keys,
    },
}

export type SwapInputOut = {
    fixedSide: 'out',
    amountOut: BN,
    maxAmountIn?: BN; 

    inputMint: string,
    poolId: string,
    slippage?: number, // slippage in percent
    
    shouldCloseAta?: boolean,
    shouldAddTips?: boolean,
    blockhash?: string,
    shouldAddFakeTokenAccountForMintIn?: boolean,

    poolInfoFromRpc?: {
        poolRpcData: AmmRpcData,
        poolInfo: ComputeAmountOutParam["poolInfo"],
        poolKeys: AmmV4Keys | AmmV5Keys,
    },
}

export class RaydiumManager {   
    chain: Chain; 
    raydium: Raydium | undefined;
    owner: web3.Keypair;
    connection: web3.Connection;

    constructor(chain: Chain, privateKey: string) {
        this.chain = chain;
        this.owner = web3.Keypair.fromSecretKey(base58.decode(privateKey));
        this.connection = newConnectionByChain(chain);
    }

    async init() {
        this.raydium = await this.initRaydium(undefined, undefined);    
        // await this.fetchWsolTokenAccount();    
    }
    
    async initRaydium(tokenAccounts?: TokenAccount[], tokenAccountRawInfos?: TokenAccountRaw[]): Promise<Raydium> {
        let time = Date.now();

        LogManager.log('RaydiumManager', 'init1', 'time:', (Date.now() - time), 'ms');
        time = Date.now();

        const disableLoadToken = tokenAccounts == undefined ? false : true;

        const raydium = await Raydium.load({
            connection: this.connection,
            owner: this.owner, // key pair or publicKey, if you run a node process, provide keyPair
            disableLoadToken: disableLoadToken, // default is false, if you don't need token info, set to true
            blockhashCommitment: 'processed',
            jupTokenType: JupTokenType.ALL,
            tokenAccounts: tokenAccounts,
            tokenAccountRawInfos: tokenAccountRawInfos,
        });
        LogManager.log('RaydiumManager', 'init2', 'time:', (Date.now() - time), 'ms');
        time = Date.now();
        return raydium;
    }

    async swap(input: SwapInput): Promise<{tx: web3.VersionedTransaction} | undefined> {
        const timeLogs: {log: string, date: Date}[] = [];
        timeLogs.push({log: 'swap1', date: new Date()});

        const inputMint = input.inputMint;
        const poolId = input.poolId;
        const blockhash = input.blockhash || (await SolanaManager.getRecentBlockhash(this.chain)).blockhash;

        if (!this.raydium){
            throw new BadRequestError('Raydium is not initialized');
        }

        const poolInfoFromRpc = await this.raydium.liquidity.getPoolInfoFromRpc({ poolId });
        const memoryPool = {
            poolInfo: poolInfoFromRpc.poolInfo,
            poolKeys: poolInfoFromRpc.poolKeys,
            rpcData: poolInfoFromRpc.poolRpcData,
        };
        if (!memoryPool.poolInfo){ LogManager.error(`Pool ${poolId} has no poolInfo`); return; }
        if (!memoryPool.poolKeys){ LogManager.error(`Pool ${poolId} has no poolKeys`); return; }
        if (!memoryPool.rpcData){ LogManager.error(`Pool ${poolId} has no rpcData`); return; }
        timeLogs.push({log: 'swap3', date: new Date()});

        const poolInfo = memoryPool.poolInfo;
        const poolKeys = memoryPool.poolKeys;
        const rpcData = memoryPool.rpcData;
       
        const [baseReserve, quoteReserve, status] = [rpcData.baseReserve, rpcData.quoteReserve, rpcData.status.toNumber()]
        timeLogs.push({log: 'swap4', date: new Date()});

        if (poolInfo.mintA.address !== inputMint && poolInfo.mintB.address !== inputMint){
            throw new Error('input mint does not match pool');
        }
      
        const baseIn = inputMint === poolInfo.mintA.address
        const [mintIn, mintOut] = baseIn ? [poolInfo.mintA, poolInfo.mintB] : [poolInfo.mintB, poolInfo.mintA]

        // I don't need this for sandwich bot, because I'll create token ata every time. But I need this for sniper bot and for Nova
        // const tokenMint = mintIn.address == Token.WSOL.mint.toBase58() ? mintOut.address : mintIn.address;
        timeLogs.push({log: 'swap5', date: new Date()});        

        let amountIn: BN;
        let amountOut: BN;

        if (input.fixedSide == 'in'){
            amountIn = input.amountIn;

            if (input.minAmountOut){
                // this is used for sniper bot and sandwich bot
                amountOut = input.minAmountOut;
            }
            else {
                const computed = this.raydium.liquidity.computeAmountOut({
                    poolInfo: {
                        ...poolInfo,
                        baseReserve,
                        quoteReserve,
                        status,
                        version: 4,
                    },
                    amountIn: input.amountIn,
                    mintIn: mintIn.address,
                    mintOut: mintOut.address,
                    slippage: (input.slippage || 0.01) / 100, // by default slippage is 0.01%, which is almost zero
                })
                amountOut = computed.minAmountOut;
            }
        }
        else {
            amountOut = input.amountOut;

            if (input.maxAmountIn){
                amountIn = input.maxAmountIn;
            }
            else {
                const computed = this.raydium.liquidity.computeAmountIn({
                    poolInfo: {
                        ...poolInfo,
                        baseReserve,
                        quoteReserve,
                        status,
                        version: 4,
                    },
                    amountOut: input.amountOut,
                    mintIn: mintIn.address,
                    mintOut: mintOut.address,
                    slippage: (input.slippage || 0.01) / 100, // by default slippage is 0.01%, which is almost zero
                })
                amountIn = computed.maxAmountIn;
            }
        }
        timeLogs.push({log: 'swap9', date: new Date()});

        LogManager.log('swap9', 'amountIn:', amountIn.toString(), 'amountOut:', amountOut.toString());
        LogManager.log('mintIn.address:', mintIn.address);

        let { transaction, builder } = await this.raydium.liquidity.swap({
            poolInfo,
            poolKeys,
            amountIn: amountIn,
            amountOut: amountOut, 
            fixedSide: input.fixedSide,
            inputMint: mintIn.address,
            txVersion: TxVersion.V0,
        
            config: {
                inputUseSolBalance: true, // default: true, if you want to use existed wsol token account to pay token in, pass false
                outputUseSolBalance: true, // default: true, if you want to use existed wsol token account to receive token out, pass false
                associatedOnly: true, // default: true, if you want to use ata only, pass true
            },
        
            //TODO: set up priority fee here. do we need it since we use Jito?
            // computeBudgetConfig: {
            //     units: 120000,
            //     microLamports: 1000000,
            // },
        });

        timeLogs.push({log: 'swap10', date: new Date()});

        LogManager.log('swap10');

        if (input.shouldCloseAta){
            const tokenAta = this.raydium.account.tokenAccounts.find(ta => ta.mint.toBase58() == mintIn.address)?.publicKey;
            if (tokenAta){
                LogManager.log('!tokenAta found');
                const closeAtaIx = SolanaManager.createBurnSplAccountInstruction(tokenAta, this.owner.publicKey, this.owner.publicKey);
                builder.addInstruction({endInstructions: [closeAtaIx]});
                timeLogs.push({log: 'swap11', date: new Date()});
            }
            else {
                LogManager.log('!tokenAta not found');
            }
        }

        const swapResult = await builder.buildV0({
            recentBlockhash: blockhash,
            // lookupTableAddress: swapResult.builder.AllTxData.lookupTableAddress,
            // lookupTableCache: LOOKUP_TABLE_CACHE,
        });

        const tx = swapResult.transaction;

        timeLogs.push({log: 'swap13', date: new Date()});

        const tookMs = timeLogs[timeLogs.length-1].date.getTime() - timeLogs[0].date.getTime();
        LogManager.log('swap', 'took:', tookMs, 'ms', 'Times:', JSON.stringify(timeLogs));

        return { tx };
    }

    async calcAmountOut(input: SwapInput): Promise<{
        amountOut: BN, 
        poolInfoFromRpc: {
            poolRpcData: AmmRpcData,
            poolInfo: ComputeAmountOutParam["poolInfo"],
            poolKeys: AmmV4Keys | AmmV5Keys,
        }
    }> {
        if (!this.raydium){
            throw new BadRequestError('Raydium is not initialized');
        }
        if (input.fixedSide != 'in'){
            throw new BadRequestError('fixedSide should be "in"');
        }

        const poolId = input.poolId;

        const poolInfoFromRpc = await this.raydium.liquidity.getPoolInfoFromRpc({ poolId });
        const poolInfo = poolInfoFromRpc.poolInfo;
        const poolKeys = poolInfoFromRpc.poolKeys;
        const rpcData = poolInfoFromRpc.poolRpcData;
       
        const [baseReserve, quoteReserve, status] = [rpcData.baseReserve, rpcData.quoteReserve, rpcData.status.toNumber()]

        if (poolInfo.mintA.address !== input.inputMint && poolInfo.mintB.address !== input.inputMint){
            throw new Error('input mint does not match pool');
        }
      
        const baseIn = input.inputMint === poolInfo.mintA.address
        const [mintIn, mintOut] = baseIn ? [poolInfo.mintA, poolInfo.mintB] : [poolInfo.mintB, poolInfo.mintA]

        let amountIn: BN;
        let amountOut: BN;

        amountIn = input.amountIn;

        const computed = this.raydium.liquidity.computeAmountOut({
            poolInfo: {
                ...poolInfo,
                baseReserve,
                quoteReserve,
                status,
                version: 4,
            },
            amountIn: input.amountIn,
            mintIn: mintIn.address,
            mintOut: mintOut.address,
            slippage: (input.slippage || 0.01) / 100, // by default slippage is 0.01%, which is almost zero
        })
        amountOut = computed.minAmountOut;

        return { amountOut, poolInfoFromRpc };

    }

    // async fetchWsolTokenAccount(): Promise<{tokenAccount: TokenAccount, tokenAccountRawInfo?: TokenAccountRaw} | undefined> {
    //     if (this.raydium){
    //         const { tokenAccounts, tokenAccountRawInfos } = await this.raydium.account.fetchWalletTokenAccounts({forceUpdate: true, commitment: 'confirmed'})

    //         const wsolTokenAccount = tokenAccounts.find(ta => ta.mint.toBase58() == Token.WSOL.mint.toBase58());
    //         if (wsolTokenAccount){
    //             const tokenAccountRawInfo = tokenAccountRawInfos.find(ta => ta.pubkey.toBase58() == wsolTokenAccount.publicKey?.toBase58());
    //             return {tokenAccount: wsolTokenAccount, tokenAccountRawInfo: tokenAccountRawInfo};
    //         }
    //     }

    //     return undefined;
    // }

    buildFakeTokenAccount(tokenAta: string, mint: string, owner: string, amount: BN): {tokenAccount: TokenAccount, tokenAccountRawInfo: TokenAccountRaw} {
        const tokenAccount: TokenAccount = {
            publicKey: new web3.PublicKey(tokenAta),
            mint: new web3.PublicKey(mint),
            isAssociated: true,
            amount: amount,
            isNative: false,
            programId: spl.TOKEN_PROGRAM_ID,
        };


        const tokenAccountRawInfo: TokenAccountRaw = {
            programId: spl.TOKEN_PROGRAM_ID,
            pubkey: new web3.PublicKey(tokenAta),
            accountInfo: {
                mint: new web3.PublicKey(mint),
                owner: new web3.PublicKey(owner),
                amount: amount,
                delegateOption: 0,
                delegate: new web3.PublicKey('11111111111111111111111111111111'),
                state: 1,
                isNativeOption: 0,
                isNative: new BN(0),
                delegatedAmount: new BN(0),
                closeAuthorityOption: 0,
                closeAuthority: new web3.PublicKey('11111111111111111111111111111111'),
            }
        };


        return {tokenAccount, tokenAccountRawInfo};
    }

    async addLiquidity(poolId: string, slippage: number): Promise<web3.VersionedTransaction> {
        if (!this.raydium){
            throw new BadRequestError('Raydium is not initialized');
        }

        let poolKeys: AmmV4Keys | AmmV5Keys | undefined
        let poolInfo: ApiV3PoolInfoStandardItem;
      
        const data = await this.raydium.liquidity.getPoolInfoFromRpc({ poolId })
        poolInfo = data.poolInfo
        poolKeys = data.poolKeys
      
        if (!isValidAmm(poolInfo.programId)) throw new Error('target pool is not AMM pool')
      
        const inputAmount = '1'
      
        const r = this.raydium.liquidity.computePairAmount({
            poolInfo,
            amount: inputAmount,
            baseIn: true,
            slippage: new Percent(slippage, 100), 
        })
      
        const { transaction } = await this.raydium.liquidity.addLiquidity({
            poolInfo,
            poolKeys,
            amountInA: new TokenAmount(
                toToken(poolInfo.mintA),
                new Decimal(inputAmount).mul(10 ** poolInfo.mintA.decimals).toFixed(0)
            ),
            amountInB: new TokenAmount(
                toToken(poolInfo.mintB),
                new Decimal(r.maxAnotherAmount.toExact()).mul(10 ** poolInfo.mintB.decimals).toFixed(0)
            ),
            otherAmountMin: r.minAnotherAmount,
            fixedSide: 'a',
            txVersion: TxVersion.V0,
            // optional: set up priority fee here
            // computeBudgetConfig: {
            //   units: 600000,
            //   microLamports: 46591500,
            // },
        
            // optional: add transfer sol to tip account instruction. e.g sent tip to jito
            // txTipConfig: {
            //   address: new PublicKey('96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5'),
            //   amount: new BN(10000000), // 0.01 sol
            // },
        })
      
        return transaction;
        
    }

    // ----------------------------

    static async buyHoneypot(chain: Chain, owner: string, mint: string, lamports: number, slippage?: number): Promise<web3.VersionedTransaction[]> {
        const txs: web3.VersionedTransaction[] = [];

        const maxSolLamports = Math.round((lamports/2) * 1.2);


        const raydium = new RaydiumManager(chain, owner);
        await raydium.init();
        const poolId = await RaydiumManager.fetchPoolByMint(raydium.raydium, mint);
        if (!poolId){
            throw new BadRequestError('Pool not found');
        }

        const blockhash = (await SolanaManager.getRecentBlockhash(chain)).blockhash;

        const calcResults = await raydium.calcAmountOut({
            fixedSide: 'in',
            amountIn: new BN(Math.round(lamports/2)),
            inputMint: kSolAddress,
            poolId: poolId,
        });
        const poolInfoFromRpc = calcResults.poolInfoFromRpc;

        console.log('calcResults.amountOut', calcResults.amountOut.toString());

        const input: SwapInput = {
            fixedSide: 'out',
            amountOut: calcResults.amountOut,
            maxAmountIn: new BN(maxSolLamports),
            inputMint: kSolAddress,
            poolId: poolId,        
            blockhash: blockhash,
            poolInfoFromRpc: poolInfoFromRpc,
        }

        const result = await raydium.swap(input);

        if (!result?.tx){
            throw new BadRequestError('Swap failed');
        }

        txs.push(result.tx);

        

        //TODO: add LP tx
        const addLiquidityTx = await this.addLiquidity(poolId, 0.01);

        //TODO: burn ATA for mint token on owner wallet (so that it can't be frozen and we don't loose 0.002 SOL for frozen rent)


        return txs;
    }

    // static async buyTx(chain: Chain, owner: string, mint: string, lamports: number, fixedSide: 'in' | 'out', slippage?: number): Promise<web3.VersionedTransaction | undefined> {
    //     const raydium = new RaydiumManager(chain, owner);
    //     await raydium.init();
    //     const poolId = await RaydiumManager.fetchPoolByMint(raydium.raydium, mint);
    //     if (!poolId){
    //         throw new BadRequestError('Pool not found');
    //     }

    //     const blockhash = (await SolanaManager.getRecentBlockhash(chain)).blockhash;

    //     const input: SwapInput = {
    //         fixedSide: fixedSide,
    //         amountIn: fixedSide == 'in' ? new BN(lamports) : new BN(0),
    //         amountOut: fixedSide == 'out' ? new BN(lamports) : new BN(0),
            
    //         inputMint: kSolAddress,
    //         poolId: poolId,
    //         slippage: slippage, 
        
    //         blockhash: blockhash,
    //     }

    //     const result = await raydium.swap(input);
    //     return result?.tx;
    // }

    // static async sellTx(chain: Chain, owner: string, mint: string, percent: number, sendThrough: SendThrough = {useJito: true}): Promise<web3.VersionedTransaction | undefined> {
    //     const raydium = new RaydiumManager(chain, owner);
    //     await raydium.init();
    //     const poolId = await RaydiumManager.fetchPoolByMint(raydium.raydium, mint);
    //     if (!poolId){
    //         throw new BadRequestError('Pool not found');
    //     }

    //     if (!raydium.raydium){
    //         throw new BadRequestError('Raydium is not initialized');
    //     }

    //     const tokenAccounts = await raydium.raydium.account.fetchWalletTokenAccounts({forceUpdate: true, commitment: 'processed'});
    //     const tokenAcc = tokenAccounts.tokenAccounts.find(ta => ta.mint.toBase58() == mint);
    //     if (!tokenAcc){
    //         throw new BadRequestError('Token account not found');
    //     }

    //     if (tokenAcc.amount.eq(new BN(0))){
    //         throw new BadRequestError('Token account has no balance');
    //     }
       
    //     const blockhash = (await SolanaManager.getRecentBlockhash(chain)).blockhash;
    //     const amountIn = percent == 100 ? tokenAcc.amount : tokenAcc.amount.mul(new BN(percent)).div(new BN(100));

    //     const input: SwapInput = {
    //         fixedSide: 'in',
    //         amountIn: amountIn,
        
    //         inputMint: mint,
    //         poolId: poolId,
    //         slippage: 200, //DBManager.db.config.slippage,
        
    //         blockhash: blockhash,

    //         shouldCloseAta: percent == 100,
    //     }

    //     const result = await raydium.swap(input);
    //     return result?.tx;
    // }

    static async fetchPoolByMint(raydium: Raydium | undefined, mintA: string, mintB: string = kSolAddress): Promise<string | undefined> {
        if (MemoryManager.poolByMintAddress[mintA] && mintB == kSolAddress){
            return MemoryManager.poolByMintAddress[mintA];
        }

        if (!raydium){
            throw new BadRequestError('Raydium is not initialized');
        }

        const data = await raydium.api.fetchPoolByMints({
            mint1: mintA,
            mint2: mintB // optional,
            // extra params: https://github.com/raydium-io/raydium-sdk-V2/blob/master/src/api/type.ts#L249
        });

        const pools = data.data
        for (const obj of pools) {
            if (obj.type === "Standard") {
                LogManager.log(`AMM Pool ID: ${obj.id}`);
                if (mintB == kSolAddress){
                    MemoryManager.poolByMintAddress[mintA] = obj.id;
                }
                else if (mintA == kSolAddress){
                    MemoryManager.poolByMintAddress[mintB] = obj.id;
                }
                return obj.id;
            }
        }
    }


}