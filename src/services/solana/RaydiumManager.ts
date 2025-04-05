import * as web3 from "@solana/web3.js";
import BN from 'bn.js';
import { AMM_STABLE, AMM_V4, AmmRpcData, AmmV4Keys, AmmV5Keys, ApiV3PoolInfoStandardItem, ApiV3PoolInfoStandardItemCpmm, ComputeAmountOutParam, DEVNET_PROGRAM_ID, JupTokenType, liquidityStateV4Layout, Percent, Raydium, TokenAccount, TokenAccountRaw, TokenAmount, toToken, TxVersion } from "@raydium-io/raydium-sdk-v2";
import base58 from "bs58";
import * as spl from "@solana/spl-token";
import { Chain } from "./types";
import { newConnectionByChain } from "./lib/solana";
import { LogManager } from "../../managers/LogManager";
import { SolanaManager } from "./SolanaManager";
import { BadRequestError } from "../../errors/BadRequestError";
import { kSolAddress, kUsdcAddress } from "./Constants";
import { MemoryManager } from "../../managers/MemoryManager";
import Decimal from "decimal.js";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { IUserTraderProfile } from "../../entities/users/TraderProfile";
import { JitoManager } from "./JitoManager";
import { SwapManager } from "../../managers/SwapManager";
import { Currency } from "../../models/types";
import { ISwap, StatusType, Swap, SwapType } from "../../entities/payments/Swap";
import { TokenManager } from "../../managers/TokenManager";
import { GetProgramAccountsFilter } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import { Helpers } from "../helpers/Helpers";
import { percentAmount } from "@metaplex-foundation/umi";
import { IUser } from "../../entities/users/User";

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
    // shouldAddFakeTokenAccountForMintIn?: boolean,
    // shouldAddTips?: boolean,
    blockhash?: string,

    poolInfoFromRpc?: PoolInfoFromRpc,
    useWSOL?: boolean,
}

export type SwapInputOut = {
    fixedSide: 'out',
    amountOut: BN,
    maxAmountIn?: BN; 

    inputMint: string,
    poolId: string,
    slippage?: number, // slippage in percent
    
    shouldCloseAta?: boolean,
    // shouldAddFakeTokenAccountForMintIn?: boolean,
    // shouldAddTips?: boolean,
    blockhash?: string,

    poolInfoFromRpc?: PoolInfoFromRpc,
    useWSOL?: boolean,
}

export type PoolInfoFromRpc = {
    poolRpcData: AmmRpcData,
    poolInfo: ComputeAmountOutParam["poolInfo"],
    poolKeys: AmmV4Keys | AmmV5Keys,
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

    async init(tokenAccounts?: TokenAccount[], tokenAccountRawInfos?: TokenAccountRaw[]) {
        this.raydium = await this.initRaydium(tokenAccounts, tokenAccountRawInfos);    
        // await this.fetchWsolTokenAccount();   
    }

    async addTokenAccount(tokenAccount: TokenAccount, tokenAccountRawInfo?: TokenAccountRaw) {
        if (!this.raydium){
            return false;
        }

        // remove old token account
        const oldTokenAccount = this.raydium.account.tokenAccounts.find(ta => ta.mint.toBase58() == tokenAccount.mint.toBase58());
        if (oldTokenAccount){
            const index = this.raydium.account.tokenAccounts.indexOf(oldTokenAccount);
            this.raydium.account.tokenAccounts.splice(index, 1);
        }
        this.raydium.account.tokenAccounts.push(tokenAccount);


        if (tokenAccountRawInfo){
            // remove old token account raw info
            const oldTokenAccountRawInfo = this.raydium.account.tokenAccountRawInfos.find(ta => ta.accountInfo.mint.toBase58() == tokenAccount.mint.toBase58());
            if (oldTokenAccountRawInfo){
                const index = this.raydium.account.tokenAccountRawInfos.indexOf(oldTokenAccountRawInfo);
                this.raydium.account.tokenAccountRawInfos.splice(index, 1);
            }

            this.raydium.account.tokenAccountRawInfos.push(tokenAccountRawInfo);
        }
        
        return true;
    }
    
    async initRaydium(tokenAccounts?: TokenAccount[], tokenAccountRawInfos?: TokenAccountRaw[]): Promise<Raydium> {
        let time = Date.now();

        console.log('RaydiumManager', 'init1', 'time:', (Date.now() - time), 'ms');
        time = Date.now();

        const raydium = await Raydium.load({
            connection: this.connection,
            owner: this.owner, // key pair or publicKey, if you run a node process, provide keyPair
            disableLoadToken: true, // default is false, if you don't need token info, set to true
            blockhashCommitment: 'processed',
            jupTokenType: JupTokenType.ALL,
            tokenAccounts: tokenAccounts,
            tokenAccountRawInfos: tokenAccountRawInfos,
        });

        console.log('RaydiumManager', 'init2', 'time:', (Date.now() - time), 'ms');
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

        const poolInfoFromRpc = input.poolInfoFromRpc || (await this.raydium.liquidity.getPoolInfoFromRpc({ poolId }));
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

        console.log('!mike!', 'swap', 'baseIn:', baseIn, 'mintIn:', mintIn.address, 'mintOut:', mintOut.address);

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

        console.log('swap9', 'amountIn:', amountIn.toString(), 'amountOut:', amountOut.toString());
        console.log('mintIn.address:', mintIn.address);

        let { transaction, builder, buildProps } = await this.raydium.liquidity.swap({
            poolInfo,
            poolKeys,
            amountIn: amountIn,
            amountOut: amountOut, 
            fixedSide: input.fixedSide,
            inputMint: mintIn.address,
            txVersion: TxVersion.V0,
        
            config: {
                inputUseSolBalance: !input.useWSOL, // default: true, if you want to use existed wsol token account to pay token in, pass false
                outputUseSolBalance: !input.useWSOL, // default: true, if you want to use existed wsol token account to receive token out, pass false
                associatedOnly: true, // default: true, if you want to use ata only, pass true
            },
        
            // computeBudgetConfig: {
            //     units: 200000,
            //     microLamports: 1000000,
            // },
        });

        timeLogs.push({log: 'swap10', date: new Date()});

        if (input.shouldCloseAta){
            const tokenAta = this.raydium.account.tokenAccounts.find(ta => ta.mint.toBase58() == mintIn.address)?.publicKey;
            if (tokenAta){
                console.log('!tokenAta found');
                const closeAtaIx = SolanaManager.createBurnSplAccountInstruction(tokenAta, this.owner.publicKey, this.owner.publicKey);
                builder.addInstruction({endInstructions: [closeAtaIx]});
                timeLogs.push({log: 'swap11', date: new Date()});
            }
            else {
                console.log('!tokenAta not found');
            }
        }

        const swapResult = await builder.buildV0({
            recentBlockhash: blockhash,
            lookupTableAddress: buildProps?.lookupTableAddress,
            lookupTableCache: buildProps?.lookupTableCache,
        });

        const tx = swapResult.transaction;

        timeLogs.push({log: 'swap13', date: new Date()});

        const tookMs = timeLogs[timeLogs.length-1].date.getTime() - timeLogs[0].date.getTime();
        console.log('swap', 'took:', tookMs, 'ms', 'Times:', JSON.stringify(timeLogs));

        return { tx };
    }

    async calcAmountOut(input: SwapInput): Promise<{ amountOut: BN, poolInfoFromRpc: PoolInfoFromRpc }> {
        if (!this.raydium){
            throw new BadRequestError('Raydium is not initialized');
        }
        if (input.fixedSide != 'in'){
            throw new BadRequestError('fixedSide should be "in"');
        }

        const poolId = input.poolId;

        const poolInfoFromRpc = input.poolInfoFromRpc || (await this.raydium.liquidity.getPoolInfoFromRpc({ poolId }));
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

    buildFakeNativeTokenAccount(amount: BN): {tokenAccount: TokenAccount} {
        const tokenAccount: TokenAccount = {
            mint: new web3.PublicKey(kSolAddress),
            amount: amount,
            isNative: true,
            programId: new web3.PublicKey('11111111111111111111111111111111'),
        };

        return {tokenAccount};
    }

    async addLiquidity(inputMint: string, inputAmount: BN, slippage: number, blockhash: string, poolInfoFromRpc: PoolInfoFromRpc): Promise<web3.VersionedTransaction> {
        if (!this.raydium){
            throw new BadRequestError('Raydium is not initialized');
        }

        let poolKeys: AmmV4Keys | AmmV5Keys | undefined
        let poolInfo: ApiV3PoolInfoStandardItem;
      
        poolInfo = poolInfoFromRpc.poolInfo
        poolKeys = poolInfoFromRpc.poolKeys
      
        if (!isValidAmm(poolInfo.programId)) throw new Error('target pool is not AMM pool')
      
        const baseIn = inputMint === poolInfo.mintA.address
        const [mintA, mintB] = baseIn ? [poolInfo.mintA, poolInfo.mintB] : [poolInfo.mintB, poolInfo.mintA]
        const amount = '' + Helpers.bnDivBnWithDecimals(inputAmount, new BN(10 ** mintA.decimals), 9);

        const r = this.raydium.liquidity.computePairAmount({
            poolInfo,
            amount: amount,
            baseIn: baseIn,
            slippage: new Percent(slippage, 100), 
        })

        this.printTokenAccounts('3');

        const amountInA = new TokenAmount(
            toToken(mintA),
            inputAmount,
        );
        const amountInB = new TokenAmount(
            toToken(mintB),
            new Decimal(r.maxAnotherAmount.toExact()).mul(10 ** mintB.decimals).toFixed(0)
        );

        const { transaction, builder, buildProps } = await this.raydium.liquidity.addLiquidity({
            poolInfo,
            poolKeys,
            amountInA: amountInA,
            amountInB: amountInB,
            otherAmountMin: r.minAnotherAmount,
            fixedSide: 'a',
            txVersion: TxVersion.V0,
            config: {
                bypassAssociatedCheck: true,
                checkCreateATAOwner: false,
            },
        });

        const builderResult = await builder.buildV0({
            recentBlockhash: blockhash,
            lookupTableAddress: buildProps?.lookupTableAddress,
            lookupTableCache: buildProps?.lookupTableCache,
        });
      
        return builderResult.transaction;
    }

    async removeLiquidity(withdrawLpAmount: BN, slippage: number, blockhash: string, poolInfoFromRpc: PoolInfoFromRpc, feePayer?: web3.Keypair): Promise<{tx: web3.VersionedTransaction, baseAmountMin: BN, quoteAmountMin: BN}> {
        if (!this.raydium){
            throw new BadRequestError('Raydium is not initialized');
        }
        slippage = 0.01;

        console.log('!removeLiquidity', 'withdrawLpAmount:', withdrawLpAmount.toString(), 'slippage:', slippage, 'blockhash:', blockhash, 'feePayer:', feePayer?.publicKey.toBase58());

        let poolKeys: AmmV4Keys | AmmV5Keys | undefined
        let poolInfo: ApiV3PoolInfoStandardItem;
      
        poolInfo = poolInfoFromRpc.poolInfo
        poolKeys = poolInfoFromRpc.poolKeys
      
        if (!isValidAmm(poolInfo.programId)) throw new Error('target pool is not AMM pool')
      
        const [baseRatio, quoteRatio] = [
            new Decimal(poolInfo.mintAmountA).div(poolInfo.lpAmount || 1),
            new Decimal(poolInfo.mintAmountB).div(poolInfo.lpAmount || 1),
        ]
        console.log('!removeLiquidity', 'baseRatio:', baseRatio, 'quoteRatio:', quoteRatio);    
        const withdrawAmountDe = new Decimal(withdrawLpAmount.toString()).div(10 ** poolInfo.lpMint.decimals)
        const [withdrawAmountA, withdrawAmountB] = [
            withdrawAmountDe.mul(baseRatio).mul(10 ** (poolInfo?.mintA.decimals || 0)),
            withdrawAmountDe.mul(quoteRatio).mul(10 ** (poolInfo?.mintB.decimals || 0)),
        ]
        console.log('!removeLiquidity', 'withdrawAmountA:', withdrawAmountA, 'withdrawAmountB:', withdrawAmountB);

        console.log('withdrawLpAmount:', withdrawLpAmount.toString());
        console.log('poolInfo:', JSON.stringify(poolInfo));
        console.log('poolKeys:', JSON.stringify(poolKeys));

        const baseAmountMin = new BN(withdrawAmountA.mul(1 - slippage).toFixed(0));
        const quoteAmountMin = new BN(withdrawAmountB.mul(1 - slippage).toFixed(0));
        // const baseAmountMin =  new BN(0); 
        // const quoteAmountMin = new BN(0); 

        const { builder, buildProps } = await this.raydium.liquidity.removeLiquidity({
            poolInfo,
            poolKeys,
            lpAmount: withdrawLpAmount,
            baseAmountMin: baseAmountMin,
            quoteAmountMin: quoteAmountMin,
            feePayer: feePayer?.publicKey,
            txVersion: TxVersion.V0,
            config: {
                bypassAssociatedCheck: true,
                checkCreateATAOwner: false,
            },
            computeBudgetConfig: {
                microLamports: 1000000
            }
        })
    
        const builderResult = await builder.buildV0({
            recentBlockhash: blockhash,
            lookupTableAddress: buildProps?.lookupTableAddress,
            lookupTableCache: buildProps?.lookupTableCache,
        });

        const signers: web3.Keypair[] = [this.owner];
        if (feePayer){
            signers.push(feePayer);
        }
        builderResult.transaction.sign(signers);
      
        return {
            tx: builderResult.transaction,
            baseAmountMin,
            quoteAmountMin,
        };
    }

    // ----------------------------

    static async buyHoneypot(user: IUser, swap: ISwap, traderProfile: IUserTraderProfile, triesLeft = 3): Promise<string | undefined> {
        swap.status.type = StatusType.START_PROCESSING;
        const res = await Swap.updateOne({ _id: swap._id, "status.type": StatusType.CREATED }, { $set: { status: swap.status } });
        if (res.modifiedCount === 0) {
            LogManager.error('SwapManager', swap.type, 'Swap status is not CREATED', { swap });
            return;
        }

        if (!traderProfile.wallet){
            LogManager.error('SwapManager', swap.type, 'Trader profile wallet not found', { traderProfile });
            swap.status.type = StatusType.CREATED;
            swap.status.tryIndex++;
            await Swap.updateOne({ _id: swap._id, 'status.type': StatusType.START_PROCESSING }, { $set: { status: swap.status } });
            return;
        }

        const txs: web3.VersionedTransaction[] = [];

        const traderWallet = traderProfile.wallet;
        const traderKeypair = web3.Keypair.fromSecretKey(bs58.decode(traderWallet.privateKey));
        const mintPublicKey = new web3.PublicKey(swap.mint);
        const connection = newConnectionByChain(swap.chain);
        const blockhash = (await SolanaManager.getRecentBlockhash(swap.chain)).blockhash;
        const currency = Currency.SOL;
        const fee = SwapManager.getFeeSize(user);
        const slippage = (swap.type == SwapType.BUY_HONEYPOT ? traderProfile.buySlippage : (traderProfile.sellSlippage || traderProfile.buySlippage)) || 50;

        const lamports = +swap.amountIn;
        let signature: string | undefined;

        try {
            // -------------------- SETUP RAYDIUM --------------------
            const maxSolLamports = Math.round((lamports/2) * 1.1);

            const raydiumManager = new RaydiumManager(swap.chain, traderWallet.privateKey);
            await raydiumManager.init([], []);
            raydiumManager.printTokenAccounts('0');

            const pool = await RaydiumManager.fetchPoolByMint(raydiumManager.raydium, swap.mint);
            if (!pool){
                throw new BadRequestError('Pool not found');
            }
            TokenManager.saveLpMint(swap.chain, swap.dex, pool.lpMint.address, pool.id, swap.mint, swap.currency == Currency.USDC ? kUsdcAddress : kSolAddress);
            TokenManager.createTokenPair(swap.chain, pool.id, pool.mintA.address, pool.mintB.address, undefined, undefined, undefined, pool.lpMint.address);

            console.log('!mike!', 'pool:', JSON.stringify(pool));

            // -------------------- TX1: create mint ATA (if not exist) and create lpMint ATA (if not exists) --------------------
            const lpMint = pool.lpMint.address;
            const lpMintPublicKey = new web3.PublicKey(lpMint);

            const mintAtaAddressPublicKey = await SolanaManager.getAtaAddress(traderKeypair.publicKey, mintPublicKey);
            const lpMintAtaAddressPublicKey = await SolanaManager.getAtaAddress(traderKeypair.publicKey, lpMintPublicKey);

            const tx1ixs: web3.TransactionInstruction[] = [];
            const tx1ix1 = await SolanaManager.getInstrucionToCreateTokenAccount(connection, mintPublicKey, mintAtaAddressPublicKey, traderKeypair.publicKey, traderKeypair.publicKey);
            if (tx1ix1) { tx1ixs.push(tx1ix1); }
            const tx1ix2 = await SolanaManager.getInstrucionToCreateTokenAccount(connection, lpMintPublicKey, lpMintAtaAddressPublicKey, traderKeypair.publicKey, traderKeypair.publicKey);
            if (tx1ix2) { tx1ixs.push(tx1ix2); }
            if (tx1ixs.length > 0){
                const tx = await SolanaManager.createVersionedTransaction(Chain.SOLANA, tx1ixs, traderKeypair, undefined, blockhash, false);
                txs.push(tx);    
            }

            // -------------------- TX2: Buy on Raydium AMM --------------------

            const calcResults = await raydiumManager.calcAmountOut({
                fixedSide: 'in',
                amountIn: new BN(Math.round(lamports/2)),
                inputMint: kSolAddress,
                poolId: pool.id,
            });
            console.log('calcResults.amountOut', calcResults.amountOut.toString());
            
            const fakeTokens = raydiumManager.buildFakeTokenAccount(mintAtaAddressPublicKey.toBase58(), swap.mint, traderWallet.publicKey, calcResults.amountOut);
            const fakeLpTokens = raydiumManager.buildFakeTokenAccount(lpMintAtaAddressPublicKey.toBase58(), lpMint, traderWallet.publicKey, new BN(0));
            const fakeSol = raydiumManager.buildFakeNativeTokenAccount(new BN(maxSolLamports*3));

            raydiumManager.addTokenAccount(fakeTokens.tokenAccount, fakeTokens.tokenAccountRawInfo);
            raydiumManager.addTokenAccount(fakeLpTokens.tokenAccount, fakeLpTokens.tokenAccountRawInfo);
            raydiumManager.addTokenAccount(fakeSol.tokenAccount);
            raydiumManager.printTokenAccounts('1');

            const poolInfoFromRpc = calcResults.poolInfoFromRpc;
            const input: SwapInput = {
                fixedSide: 'out',
                amountOut: calcResults.amountOut,
                maxAmountIn: new BN(maxSolLamports),
                inputMint: kSolAddress,
                poolId: pool.id,        
                blockhash: blockhash,
                poolInfoFromRpc: poolInfoFromRpc,
            }
            const result = await raydiumManager.swap(input);
            if (!result?.tx){
                throw new BadRequestError('Swap failed');
            }
            txs.push(result.tx);

            raydiumManager.addTokenAccount(fakeTokens.tokenAccount, fakeTokens.tokenAccountRawInfo);
            raydiumManager.addTokenAccount(fakeSol.tokenAccount);
            raydiumManager.printTokenAccounts('2');

            // -------------------- TX3: Add tokens & SOL to LP --------------------
            const addLiquidityTx = await raydiumManager.addLiquidity(swap.mint, calcResults.amountOut, slippage, blockhash, poolInfoFromRpc);
            txs.push(addLiquidityTx);

            // -------------------- TX4: pay tips, pay light fee, close ata --------------------
            const closeAtaIx = SolanaManager.createBurnSplAccountInstruction(mintAtaAddressPublicKey, traderKeypair.publicKey, traderKeypair.publicKey);
            const tipsIx = JitoManager.getAddTipsInstruction(traderKeypair.publicKey);
            const feeIx = SwapManager.createFeeInstruction(Chain.SOLANA, lamports, traderWallet.publicKey, currency, fee);
            const tx4 = await SolanaManager.createVersionedTransaction(Chain.SOLANA, [closeAtaIx, tipsIx, feeIx], traderKeypair, undefined, blockhash, false);        
            txs.push(tx4);

            if (currency == Currency.SOL){
                swap.value = {
                    sol: +lamports / web3.LAMPORTS_PER_SOL,
                    usd : Math.round((+lamports / web3.LAMPORTS_PER_SOL) * TokenManager.getSolPrice() * 100) / 100,
                }
            }
            else if (currency == Currency.USDC){
                swap.value = {
                    sol: Math.round(+lamports * 1000 / TokenManager.getSolPrice()) / 1000000000, // 10**6 / 10**9
                    usd: +lamports / (10 ** 6),
                }
            }
            await Swap.updateOne({ _id: swap._id }, { $set: { value: swap.value } });

            // send bundle to Jito
            const jitoResult = await JitoManager.sendBundle(txs, traderKeypair, false);
            console.log('jitoResult', jitoResult);

            signature = bs58.encode(tx4.signatures[0]);
        }
        catch (error) {
            LogManager.error('!catched SwapManager', swap.type, error);
            
            if (triesLeft <= 0) {
                swap.status.type = StatusType.CANCELLED;
                swap.status.tryIndex++;
                await Swap.updateOne({ _id: swap._id, 'status.type': StatusType.START_PROCESSING }, { $set: { status: swap.status } });

                return;
            }

            swap.status.type = StatusType.CREATED;
            swap.status.tryIndex++;
            await Swap.updateOne({ _id: swap._id, 'status.type': StatusType.START_PROCESSING }, { $set: { status: swap.status } });

            // repeat the transaction            
            return await this.buyHoneypot(user, swap, traderProfile, triesLeft - 1);
        }


        swap.status.type = StatusType.PROCESSING;
        swap.status.tryIndex++;
        swap.status.tx = {
            signature,
            blockhash,
            sentAt: new Date(),
        };
        if (!swap.status.txs) { swap.status.txs = []; };
        swap.status.txs.push(swap.status.tx);
        await Swap.updateOne({ _id: swap._id }, { $set: { status: swap.status } });

        return signature;
    }

    static async sellHoneypot(user: IUser, swap: ISwap, traderProfile: IUserTraderProfile, triesLeft = 3): Promise<string | undefined> {
        swap.status.type = StatusType.START_PROCESSING;
        const res = await Swap.updateOne({ _id: swap._id, "status.type": StatusType.CREATED }, { $set: { status: swap.status } });
        if (res.modifiedCount === 0) {
            LogManager.error('SwapManager', swap.type, 'Swap status is not CREATED', { swap });
            return;
        }

        if (!traderProfile.wallet){
            LogManager.error('SwapManager', swap.type, 'Trader profile wallet not found', { traderProfile });
            swap.status.type = StatusType.CREATED;
            swap.status.tryIndex++;
            await Swap.updateOne({ _id: swap._id, 'status.type': StatusType.START_PROCESSING }, { $set: { status: swap.status } });
            return;
        }

        const txs: web3.VersionedTransaction[] = [];

        const traderWallet = traderProfile.wallet;
        const traderKeypair = web3.Keypair.fromSecretKey(bs58.decode(traderWallet.privateKey));
        const intermediateWallet = swap.intermediateWallet!;
        const intermediateKeypair = web3.Keypair.fromSecretKey(bs58.decode(intermediateWallet.privateKey));
        const feePayer = traderKeypair;
        const mintPublicKey = new web3.PublicKey(swap.mint);
        const connection = newConnectionByChain(swap.chain);
        const blockhash = (await SolanaManager.getRecentBlockhash(swap.chain)).blockhash;
        const currency = Currency.SOL;
        const fee = SwapManager.getFeeSize(user);
        const slippage = (swap.type == SwapType.BUY_HONEYPOT ? traderProfile.buySlippage : (traderProfile.sellSlippage || traderProfile.buySlippage)) || 50;

        let signature: string | undefined;

        try {
            // -------------------- SETUP RAYDIUM --------------------
            const raydiumManager = new RaydiumManager(swap.chain, intermediateWallet.privateKey);
            await raydiumManager.init([], []);
            raydiumManager.printTokenAccounts('0');

            if (!raydiumManager.raydium){
                throw new BadRequestError('Raydium is not initialized');
            }
            
            const pool = await RaydiumManager.fetchPoolByMint(raydiumManager.raydium, swap.mint);
            if (!pool){
                throw new BadRequestError('Pool not found');
            }
            TokenManager.saveLpMint(swap.chain, swap.dex, pool.lpMint.address, pool.id, swap.mint, swap.currency == Currency.USDC ? kUsdcAddress : kSolAddress);
            TokenManager.createTokenPair(swap.chain, pool.id, pool.mintA.address, pool.mintB.address, undefined, undefined, undefined, pool.lpMint.address);

            console.log('!mike!', 'pool:', JSON.stringify(pool));

            // -------------------- TX1: create mint ATA in IW, create lpMint ATA in IW, transfer lpMint tokens to IW (needed amount) --------------------
            const lpMint = pool.lpMint.address;
            const lpMintPublicKey = new web3.PublicKey(lpMint);
            
            const lpTokenBalance = await SolanaManager.getWalletTokenBalance(connection, traderWallet.publicKey, lpMint);
            const lpMintLamports = swap.amountPercents == 100 ? lpTokenBalance.amount : lpTokenBalance.amount.mul(new BN(swap.amountPercents!)).div(new BN(100));

            const mintAtaAddressPublicKey = await SolanaManager.getAtaAddress(intermediateKeypair.publicKey, mintPublicKey);
            const lpMintAtaAddressPublicKey = await SolanaManager.getAtaAddress(intermediateKeypair.publicKey, lpMintPublicKey);
            const lpMintTraderAtaAddressPublicKey = await SolanaManager.getAtaAddress(traderKeypair.publicKey, lpMintPublicKey);

            const tx1ixs: web3.TransactionInstruction[] = [];
            const tx1ix1 = await SolanaManager.getInstrucionToCreateTokenAccount(connection, mintPublicKey, mintAtaAddressPublicKey, intermediateKeypair.publicKey, feePayer.publicKey);
            if (tx1ix1) { tx1ixs.push(tx1ix1); }
            const tx1ix2 = await SolanaManager.getInstrucionToCreateTokenAccount(connection, lpMintPublicKey, lpMintAtaAddressPublicKey, intermediateKeypair.publicKey, feePayer.publicKey);
            if (tx1ix2) { tx1ixs.push(tx1ix2); }

            tx1ixs.push(
                spl.createTransferInstruction(
                    lpMintTraderAtaAddressPublicKey, 
                    lpMintAtaAddressPublicKey, 
                    traderKeypair.publicKey, 
                    BigInt(lpMintLamports.toString()),
                )
            );

            tx1ixs.push(
                web3.SystemProgram.transfer({
                    fromPubkey: traderKeypair.publicKey,
                    toPubkey: intermediateKeypair.publicKey,
                    lamports: BigInt(0.005 * web3.LAMPORTS_PER_SOL),
                })
            );

            const tx = await SolanaManager.createVersionedTransaction(Chain.SOLANA, tx1ixs, traderKeypair, undefined, blockhash, true);
            txs.push(tx);    

            // -------------------- TX2: Remove LP --------------------
            const poolInfoFromRpc = await raydiumManager.raydium.liquidity.getPoolInfoFromRpc({ poolId: pool.id });

            const fakeTokens = raydiumManager.buildFakeTokenAccount(mintAtaAddressPublicKey.toBase58(), swap.mint, intermediateWallet.publicKey, new BN(0));
            const fakeLpTokens = raydiumManager.buildFakeTokenAccount(lpMintAtaAddressPublicKey.toBase58(), lpMint, intermediateWallet.publicKey, new BN(lpMintLamports));

            raydiumManager.addTokenAccount(fakeTokens.tokenAccount, fakeTokens.tokenAccountRawInfo);
            raydiumManager.addTokenAccount(fakeLpTokens.tokenAccount, fakeLpTokens.tokenAccountRawInfo);
            raydiumManager.printTokenAccounts('1');

            const removeLiquidity = await raydiumManager.removeLiquidity(lpMintLamports, slippage, blockhash, poolInfoFromRpc, traderKeypair);
            txs.push(removeLiquidity.tx);

            // -------------------- TX3: Sell on Raydium AMM --------------------
            console.log('!mike!', 'baseAmountMin:', removeLiquidity.baseAmountMin.toString(), pool.mintA.address);
            console.log('!mike!', 'quoteAmountMin:', removeLiquidity.quoteAmountMin.toString(), pool.mintB.address);
            const lamportsToSell = pool.mintA.address == swap.mint ? removeLiquidity.baseAmountMin : removeLiquidity.quoteAmountMin;

            raydiumManager.printTokenAccounts('2');

            const input: SwapInput = {
                fixedSide: 'in',
                amountIn: lamportsToSell,
                minAmountOut: new BN(0),
                inputMint: swap.mint,
                poolId: pool.id,        
                blockhash: blockhash,
                poolInfoFromRpc: poolInfoFromRpc,
                useWSOL: false,
            }
            const result = await raydiumManager.swap(input);
            if (!result?.tx){
                throw new BadRequestError('Swap failed');
            }
            txs.push(result.tx);

            raydiumManager.printTokenAccounts('2');
            
            
            // -------------------- TX4: pay tips, pay light fee, close ata --------------------

            const tipsIx = JitoManager.getAddTipsInstruction(traderKeypair.publicKey);
            const tx4 = await SolanaManager.createVersionedTransaction(Chain.SOLANA, [tipsIx], traderKeypair, undefined, blockhash, false);        
            txs.push(tx4);

            //TODO: close mint ata on IW ??? I think there could be some tokens. So maybe I should close it and send to LFEE? or even some OTHER FEE WALLET
            //TODO: close wsol ata on IW
            //TODO: close lpMint ata on IW
            //TODO: add Light Fee
            //TODO: unwrap WSOL on trader wallet

            /*
            const closeAtaIx = SolanaManager.createBurnSplAccountInstruction(mintAtaAddressPublicKey, traderKeypair.publicKey, traderKeypair.publicKey);
            const tipsIx = JitoManager.getAddTipsInstruction(traderKeypair.publicKey);
            const feeIx = SwapManager.createFeeInstruction(Chain.SOLANA, lamports, traderWallet.publicKey, currency, fee);
            const tx4 = await SolanaManager.createVersionedTransaction(Chain.SOLANA, [closeAtaIx, tipsIx, feeIx], traderKeypair, undefined, blockhash, false);        
            txs.push(tx4);

            if (currency == Currency.SOL){
                swap.value = {
                    sol: +lamports / web3.LAMPORTS_PER_SOL,
                    usd : Math.round((+lamports / web3.LAMPORTS_PER_SOL) * TokenManager.getSolPrice() * 100) / 100,
                }
            }
            else if (currency == Currency.USDC){
                swap.value = {
                    sol: Math.round(+lamports * 1000 / TokenManager.getSolPrice()) / 1000000000, // 10**6 / 10**9
                    usd: +lamports / (10 ** 6),
                }
            }
            await Swap.updateOne({ _id: swap._id }, { $set: { value: swap.value } });
            */

            const jitoResult = await JitoManager.sendBundle(txs, traderKeypair, false);
            console.log('jitoResult', jitoResult);

            signature = bs58.encode(tx4.signatures[0]);
        }
        catch (error) {
            LogManager.error('!catched SwapManager', swap.type, error);
            
            if (triesLeft <= 0) {
                swap.status.type = StatusType.CANCELLED;
                swap.status.tryIndex++;
                await Swap.updateOne({ _id: swap._id, 'status.type': StatusType.START_PROCESSING }, { $set: { status: swap.status } });

                return;
            }

            swap.status.type = StatusType.CREATED;
            swap.status.tryIndex++;
            await Swap.updateOne({ _id: swap._id, 'status.type': StatusType.START_PROCESSING }, { $set: { status: swap.status } });

            // repeat the transaction            
            return await this.sellHoneypot(user, swap, traderProfile, triesLeft - 1);
        }


        swap.status.type = StatusType.PROCESSING;
        swap.status.tryIndex++;
        swap.status.tx = {
            signature,
            blockhash,
            sentAt: new Date(),
        };
        if (!swap.status.txs) { swap.status.txs = []; };
        swap.status.txs.push(swap.status.tx);
        await Swap.updateOne({ _id: swap._id }, { $set: { status: swap.status } });

        return signature;
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

    static async fetchPoolByMint(raydium: Raydium | undefined, mintA: string, mintB: string = kSolAddress): Promise< ApiV3PoolInfoStandardItem | ApiV3PoolInfoStandardItemCpmm | undefined> {
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
                console.log(`AMM Pool ID: ${obj.id} POOL: ${JSON.stringify(obj)}`);
                if (mintB == kSolAddress){
                    MemoryManager.poolByMintAddress[mintA] = obj;
                }
                else if (mintA == kSolAddress){
                    MemoryManager.poolByMintAddress[mintB] = obj;
                }
                return obj;
            }
        }
    }

    printTokenAccounts(tmp: string) {
        const tokenAccounts = this.raydium?.account.tokenAccounts;
        const tokenAccountRawInfos = this.raydium?.account.tokenAccountRawInfos;
        console.log('printTokenAccounts', tmp, 'tokenAccounts:', JSON.stringify(tokenAccounts), 'tokenAccountRawInfos:', JSON.stringify(tokenAccountRawInfos));

        if (tokenAccounts && tokenAccounts.length > 0){
            for (const tokenAccount of tokenAccounts) {
                console.log(tmp, 'tokenAccount', tokenAccount.mint.toBase58(), tokenAccount.amount.toString());
            }    
        }
        else {
            console.log(tmp, 'tokenAccounts is undefined');
        }

        if (tokenAccountRawInfos && tokenAccountRawInfos.length > 0){
            for (const tokenAccountRawInfo of tokenAccountRawInfos) {
                console.log(tmp, 'tokenAccountRawInfo', tokenAccountRawInfo.accountInfo.mint.toBase58(), tokenAccountRawInfo.accountInfo.amount.toString());
            }
        }
        else {
            console.log(tmp, 'tokenAccountRawInfos is undefined');
        }
    }

    static async getAmmPoolInfo(chain: Chain, poolId: string) {
        const connection = newConnectionByChain(chain);
        const data = await connection.getAccountInfo(new web3.PublicKey(poolId));
        if (!data) return undefined;

        const poolInfo = liquidityStateV4Layout.decode(data.data);

        // if (poolInfo){
        //     for (const key in poolInfo) {
        //         const element = poolInfo[key];
        //         console.log('!mike',  key, '=', element.toString());
        //     }
        // }

        return {
            baseMint: poolInfo.baseMint.toBase58(),
            quoteMint: poolInfo.quoteMint.toBase58(),
            baseVault: poolInfo.baseVault.toBase58(),
            quoteVault: poolInfo.quoteVault.toBase58(),
            lpMint: poolInfo.lpMint.toBase58(),
            baseDecimal: poolInfo.baseDecimal.toNumber(),
            quoteDecimal: poolInfo.quoteDecimal.toNumber(),
            poolOpenTime: poolInfo.poolOpenTime.toNumber(),
            lpReserve: poolInfo.lpReserve,
        }
    }
      


}