import { CacheLTA, CurveCalculator, Network, Sega, SwapResult, TokenAccount, TokenAccountRaw, TxBuilder, TxVersion } from '@sega-so/sega-sdk';
import BN from 'bn.js';
import { SwapManager } from '../../../managers/SwapManager';
import { Chain } from '../types';
import { IUserTraderProfile } from '../../../entities/users/TraderProfile';
import * as web3 from '@solana/web3.js';
import { bs58 } from '@coral-xyz/anchor/dist/cjs/utils/bytes';
import { kSolAddress } from '../Constants';
import { SolanaManager } from '../SolanaManager';
import { Currency } from '../../../models/types';
import { newConnectionByChain } from '../lib/solana';
import { TokenManager } from '../../../managers/TokenManager';
import { kProgram } from '../../../managers/constants/ProgramConstants';
import { ITokenPair, TokenPair } from '../../../entities/tokens/TokenPair';
import { IUser } from '../../../entities/users/User';
import { IHotTokenModel } from '../../../entities/tokens/HotToken';
import { BadRequestError } from '../../../errors/BadRequestError';
import * as spl from "@solana/spl-token";

export interface ITradeThrough {
    poolId: string;
    from: string;
    to: string;
}

export interface ISegaSwapResult {
    swapAmountInLamports: BN;
    tx: web3.VersionedTransaction;
    blockhash: string;
    lamports?: {input: BN, output: BN};
}

export class SegaManager {

    static chain = Chain.SONIC;
    static kSonicAddress = 'mrujEYaN1oyQXDHeYNxBYpxWKVkQ2XsGxfznpifu4aL';
    static kSolSonicPoolId = 'DgMweMfMbmPFChTuAvTf4nriQDWpf9XX3g66kod9nsR4';
    static tradeThroughSonic: { [key: string]: ITradeThrough[] } = {
        '7yt6vPUrSCxEq3cQpQ6XKynttH5MMPfT93N1AqnosyQ3': this.buildTradeThroughSonic('7yt6vPUrSCxEq3cQpQ6XKynttH5MMPfT93N1AqnosyQ3', 'FmH2XRYcq3mL9fXNGq2ko5d4YctB3J2V6u5GYAtAsnm7'),
        'HpWK1V8U3wTyt4Gcbh9qSqaLqzVjf3UEXDPgHfUFm5o': this.buildTradeThroughSonic('HpWK1V8U3wTyt4Gcbh9qSqaLqzVjf3UEXDPgHfUFm5o', 'ARhj9Tqeejw6t96MujUD5RDaL2szHPYbgaCV23TE4G4K'),
    };

    static buildTradeThroughSonic(mint: string, poolId: string): ITradeThrough[] {
        return [
            {
                poolId: this.kSolSonicPoolId,
                from: kSolAddress,
                to: this.kSonicAddress
            },
            {
                poolId: poolId,
                from: this.kSonicAddress,
                to: mint // FOMO
            }
        ];
    }

    static async swap(user: IUser, traderProfile: IUserTraderProfile, inputMint: string, outputMint: string, inputAmount: BN, slippage: number, poolId?: string, fee?: number): Promise<ISegaSwapResult> {
        console.log('SEGA', 'swap', '!!!inputMint:', inputMint, 'outputMint:', outputMint, 'inputAmount:', inputAmount.toString(), 'slippage:', slippage);
        const tpWallet = traderProfile.getWallet();
        if (!tpWallet) {
            throw new Error('Wallet not found');
        }

        if (fee == undefined){
            fee = SwapManager.getFeeSize(user, this.chain);
        }
        console.log('SEGA', 'swap', '!!!fee:', fee);

        console.log('SEGA', 'swap', 'inputMint:', inputMint, 'outputMint:', outputMint, 'inputAmount:', inputAmount.toString(), 'slippage:', slippage);

        const connection = newConnectionByChain(this.chain);

        const wallet = web3.Keypair.fromSecretKey(bs58.decode(tpWallet.privateKey))
        const sega = await Sega.load({
            cluster: 'mainnet',
            connection,
            owner: wallet,
            apiRequestInterval: 5 * 60 * 1000,
            apiRequestTimeout: 10 * 1000,
            apiCacheTime: 5 * 60 * 1000,
            blockhashCommitment: 'confirmed',
        });

        let tradeThrough: ITradeThrough[] = [];
        if (poolId){
            tradeThrough.push({
                poolId,
                from: inputMint,
                to: outputMint
            });
        }
        else {
            const pool = await this.fetchPoolForMints(inputMint, outputMint);
            console.log('SEGA', 'swap', 'pool(1):', pool);
            if (pool){
                poolId = pool.poolId;
                tradeThrough.push({
                    poolId,
                    from: inputMint,
                    to: outputMint
                });
            }
            else {
                const tokenMint = inputMint == kSolAddress ? outputMint : inputMint;
                if (!this.tradeThroughSonic[tokenMint]){
                    const pool = await this.fetchPoolForMints(this.kSonicAddress, tokenMint);
                    console.log('SEGA', 'swap', 'pool(2):', pool);
                    if (pool){
                        this.tradeThroughSonic[tokenMint] = this.buildTradeThroughSonic(tokenMint, pool.poolId);
                        console.log('SEGA', 'swap', `this.tradeThroughSonic[${tokenMint}](1):`, this.tradeThroughSonic[tokenMint]);
                    }
                }

                console.log('SEGA', 'swap', `this.tradeThroughSonic[${tokenMint}](2):`, this.tradeThroughSonic[tokenMint]);
                if (this.tradeThroughSonic[tokenMint]){
                    if (inputMint == kSolAddress){
                        tradeThrough = this.tradeThroughSonic[tokenMint];
                        console.log('SEGA', 'swap', `tradeThrough(1):`, tradeThrough);
                    }
                    else if (outputMint == kSolAddress){
                        tradeThrough = [];
                        for (const trade of this.tradeThroughSonic[tokenMint]){
                            tradeThrough.push({
                                poolId: trade.poolId,
                                from: trade.to,
                                to: trade.from
                            });
                        }
                        tradeThrough = tradeThrough.reverse();
                        console.log('SEGA', 'swap', `tradeThrough(3):`, tradeThrough);
                        console.log('SEGA', 'swap', `tradeThrough(4):`, this.tradeThroughSonic[tokenMint]);
                    }
                }
            }
        }

        let sonicTokenAta: string | undefined = undefined;
        if (tradeThrough.length > 1){
            sonicTokenAta = await SolanaManager.getTokenAta(this.kSonicAddress, wallet.publicKey.toBase58(), spl.TOKEN_2022_PROGRAM_ID);
        }

        let txBuilder: TxBuilder | undefined = undefined;
        let txBuildProps: { lookupTableCache?: CacheLTA; lookupTableAddress?: string[]; } | undefined = undefined;
        console.log('inputAmount:', inputAmount.toString());
        let tradeIndex = 0;
        let prevSwapResult: SwapResult | undefined = undefined;
        const isBuyTrade = inputMint == kSolAddress;

        let swapResultLamports: {input: BN, output: BN} = {input: new BN(0), output: new BN(0)};

        let swapsMade = 0;
        console.log('SEGA', 'swap', 'tradeThrough:', tradeThrough);
        for (const trade of tradeThrough) {
            console.log('SEGA', 'swap', 'tradeIndex:', tradeIndex, '!0', 'trade:', trade, );
            const data = await sega.cpmm.getPoolInfoFromRpc(trade.poolId);
            console.log('SEGA', 'swap', 'tradeIndex:', tradeIndex, '!1');

            const poolInfo = data.poolInfo;
            const poolKeys = data.poolKeys;
            const rpcData = data.rpcData;

            // Verify input mint matches pool
            if (trade.from !== poolInfo.mintA.address && trade.from !== poolInfo.mintB.address) {
                throw new Error('Input mint does not match pool');
            }

            // Calculate swap parameters
            let sourceAmount = tradeIndex == 0 ? inputAmount : prevSwapResult!.destinationAmountSwapped;
            const baseIn = trade.from === poolInfo.mintA.address;
            console.log('SEGA', 'swap', 'CurveCalculator:start');
            const swapResult = CurveCalculator.swap(
                sourceAmount,
                baseIn ? rpcData.baseReserve : rpcData.quoteReserve,
                baseIn ? rpcData.quoteReserve : rpcData.baseReserve,
                rpcData.configInfo!.tradeFeeRate
            );
            console.log('SEGA', 'swap', 'CurveCalculator:end');

            console.log('SEGA', 'swap', 'swapResult:', swapResult);

            if (trade.from == inputMint){
                swapResultLamports.input = swapResult.sourceAmountSwapped;
            }
            else if (trade.from == outputMint){
                swapResultLamports.output = swapResult.sourceAmountSwapped;
            }

            if (trade.to == inputMint){
                swapResultLamports.input = swapResult.destinationAmountSwapped;
            }
            else if (trade.to == outputMint){
                swapResultLamports.output = swapResult.destinationAmountSwapped;
            }

            let fixedOut = tradeThrough.length > 1 && tradeIndex == 0 && isBuyTrade; // true only for first trade and only for BUY trades
            if (fixedOut){
                sourceAmount = swapResult.destinationAmountSwapped;
            }

            if (tradeThrough.length > 1){
                if (sonicTokenAta){
                    // check if sega.account.tokenAccounts does not contain tokenAta
                    const sonicTokenAccount = sega.account.tokenAccounts.find(ta => ta.mint.toString() == sonicTokenAta);
                    if (!sonicTokenAccount){
                        // console.log('SEGA', 'FAKE - BUILD FAKE');
                        const { tokenAccount, tokenAccountRawInfo } = this.buildFakeTokenAccount(sonicTokenAta, this.kSonicAddress, wallet.publicKey.toBase58(), new BN(0), spl.TOKEN_2022_PROGRAM_ID);
                        sega.account.tokenAccounts.push(tokenAccount);
                        sega.account.tokenAccountRawInfos.push(tokenAccountRawInfo);
                    }
                    else {
                        // console.log('SEGA', 'FAKE - NO NEED TO BUILD FAKE');
                    }
                }
                else {
                    console.log('SEGA', 'FAKE - sonicTokenAta is undefined');
                }
            }

            let swapSlippage = slippage / 100; // it should be 0 only for the first trade when multiple trades, and only for SELL trades
            if (tradeThrough.length > 1 && tradeIndex == 0){
                swapSlippage = isBuyTrade ? 0.01 : 0;
            }
            console.log('!SEGA', 'swap', 'sourceAmount:', sourceAmount.toString(), 'swapResult:', swapResult, 'swapSlippage:', swapSlippage, 'baseIn:', baseIn, 'fixedOut:', fixedOut);

            const { builder, buildProps } = await sega.cpmm.swap({
                poolInfo,
                poolKeys,
                inputAmount: sourceAmount,
                swapResult,
                slippage: swapSlippage, // range: 1 ~ 0.0001, means 100% ~ 0.01%
                baseIn,
                txVersion: TxVersion.V0,
                fixedOut: fixedOut,
            });
            console.log('!SEGA', 'sourceAmount', sourceAmount.toString(), 'all good!');


            if (!txBuilder){
                txBuilder = builder;
            }
            else {
                txBuilder.addInstruction({ endInstructions: builder.allInstructions });
            }

            if (!txBuildProps){
                txBuildProps = buildProps;
            }
            else {
                if (buildProps?.lookupTableAddress){
                    txBuildProps.lookupTableAddress = txBuildProps.lookupTableAddress || [];
                    txBuildProps.lookupTableAddress.push(...buildProps.lookupTableAddress);
                }
                if (buildProps?.lookupTableCache){
                    txBuildProps.lookupTableCache = txBuildProps.lookupTableCache || {};
                    for (const key in buildProps.lookupTableCache) {
                        txBuildProps.lookupTableCache[key] = buildProps.lookupTableCache[key];
                    }
                }
            }

            if (builder.allInstructions.length > 0){
                swapsMade++;
            }

            prevSwapResult = swapResult;
            tradeIndex++;
        }

        if (swapsMade < tradeThrough.length){
            throw new BadRequestError('Not enough swaps made');
        }

        if (!txBuilder){
            throw new BadRequestError('Tx builder not found');
        }

        // add 0.5% fee instruction to tx
        let feeIxs: web3.TransactionInstruction[] = [];        
        let swapAmountInLamports = new BN(0);
        if (inputMint == kSolAddress || outputMint == kSolAddress){
            swapAmountInLamports = inputMint == kSolAddress ? swapResultLamports.input : swapResultLamports.output;
            const ix = SwapManager.createSolFeeInstruction(this.chain, swapAmountInLamports, tpWallet.publicKey, fee);
            feeIxs = [ix];
        }
        else {
            feeIxs = await SwapManager.createSplFeeInstructions(this.chain, outputMint, swapResultLamports.output, tpWallet.publicKey, fee);
        }

        if (feeIxs.length > 0){
            txBuilder.addInstruction({
                endInstructions: feeIxs,
            });
        }

        const blockhash = (await SolanaManager.getRecentBlockhash(this.chain)).blockhash;
        const result = await txBuilder.buildV0({
            recentBlockhash: blockhash,
            lookupTableAddress: txBuildProps?.lookupTableAddress,
            lookupTableCache: txBuildProps?.lookupTableCache,
        });

        const tx = result.transaction;
        return { swapAmountInLamports, tx, blockhash, lamports: swapResultLamports };
    }

    static async fetchPoolForMints(mintA: string, mintB: string): Promise<{poolId: string} | undefined> {
        const existing = await TokenPair.findOne({
            chain: this.chain,
            $or: [
                { token1: mintA, token2: mintB },
                { token1: mintB, token2: mintA },
            ]
        });
        if (existing) {
            // console.log('Pool already exists in DB:', existing);
            return { poolId: existing.pairAddress };
        }

        let page = 1;
        const pageSize = 100;
        while (page < 10){
            const url = `https://api.sega.so/api/pools/info/list?poolType=all&poolSortField=default&sortType=desc&pageSize=${pageSize}&page=${page}`;
            const response = await fetch(url);
            if (!response.ok) {
                return undefined;
            }

            const data: any = await response.json();
            if (data && data.data && data.data.data) {
                const pools = data.data.data;
                // console.log('Page:', page, 'Pools:', pools);
                // console.log('mintA:', mintA, 'mintB:', mintB);
                for (const pool of pools) {
                    if ((pool.mintA.address == mintA && pool.mintB.address == mintB) || (pool.mintA.address == mintB && pool.mintB.address == mintA)) {
                        await TokenManager.createTokenPair(this.chain, pool.id, pool.mintA.address, pool.mintB.address, undefined, undefined, kProgram.SEGA, pool.lpMint.address);
                        
                        return { poolId: pool.id };
                    }
                }

                if (pools.length < pageSize){
                    // No more pools to fetch
                    break;
                }
            }
            else {
                break;
            }

            page++;
        }

    }

    static async fetchPoolById(poolId: string): Promise<ITokenPair | undefined> {
        const existing = await TokenPair.findOne({
            chain: this.chain,
            pairAddress: poolId,
        });
        if (existing) {
            // console.log('Pool already exists in DB:', existing);
            return existing;
        }

        let page = 1;
        const pageSize = 100;
        while (page < 10){
            const url = `https://api.sega.so/api/pools/info/list?poolType=all&poolSortField=default&sortType=desc&pageSize=${pageSize}&page=${page}`;
            const response = await fetch(url);
            if (!response.ok) {
                return undefined;
            }

            const data: any = await response.json();
            if (data && data.data && data.data.data) {
                const pools = data.data.data;
                for (const pool of pools) {
                    if (pool.id == poolId) {
                        const pair = await TokenManager.createTokenPair(this.chain, pool.id, pool.mintA.address, pool.mintB.address, undefined, undefined, kProgram.SEGA, pool.lpMint.address);
                        return pair;
                    }
                }

                if (pools.length < pageSize){
                    // No more pools to fetch
                    break;
                }
            }
            else {
                break;
            }

            page++;
        }

    }

    static async fetchHotTokens(limit: number): Promise<IHotTokenModel[] | undefined> {
        const tokens: IHotTokenModel[] = [];

        let page = 1;
        const pageSize = 100;
        const url = `https://api.sega.so/api/pools/info/list?poolType=all&poolSortField=default&sortType=desc&pageSize=${pageSize}&page=${page}`;
        const response = await fetch(url);
        if (!response.ok) {
            return undefined;
        }

        let sortIndex = 1;
        const data: any = await response.json();
        if (data && data.data && data.data.data) {
            const pools = data.data.data;
            for (const pool of pools) {
                if (pool.mintA.address == kSolAddress || pool.mintB.address == kSolAddress) {
                    const hotToken: IHotTokenModel = {
                        chain: this.chain,
                        mint: pool.mintA.address == kSolAddress ? pool.mintB.address : pool.mintA.address,
                        symbol: pool.mintA.address == kSolAddress ? pool.mintB.symbol : pool.mintA.symbol,
                        volume: { '24h': pool.day.volume },
                        sort: sortIndex++,
                    };
                    tokens.push(hotToken);

                    if (tokens.length >= limit) {
                        break;
                    }
                }
                else if (pool.mintA.address == this.kSonicAddress || pool.mintB.address == this.kSonicAddress) {
                    const hotToken: IHotTokenModel = {
                        chain: this.chain,
                        mint: pool.mintA.address == this.kSonicAddress ? pool.mintB.address : pool.mintA.address,
                        symbol: pool.mintA.address == this.kSonicAddress ? pool.mintB.symbol : pool.mintA.symbol,
                        sort: sortIndex++,
                    };
                    tokens.push(hotToken);

                    if (tokens.length >= limit) {
                        break;
                    }
                }
            }
        }

        return tokens;
    }

    static buildFakeTokenAccount(tokenAta: string, mint: string, owner: string, amount: BN, programId = spl.TOKEN_2022_PROGRAM_ID): {tokenAccount: TokenAccount, tokenAccountRawInfo: TokenAccountRaw} {        
        const tokenAccount: TokenAccount = {
            publicKey: new web3.PublicKey(tokenAta),
            mint: new web3.PublicKey(mint),
            isAssociated: true,
            amount: amount,
            isNative: false,
            programId: programId,
        };

        const tokenAccountRawInfo: TokenAccountRaw = {
            programId: programId,
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

}