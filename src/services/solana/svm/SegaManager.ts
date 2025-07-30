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
import { TokenPair } from '../../../entities/tokens/TokenPair';
import { IUser } from '../../../entities/users/User';
import { IHotTokenModel } from '../../../entities/tokens/HotToken';
import { BadRequestError } from '../../../errors/BadRequestError';
import * as spl from "@solana/spl-token";

export interface ITradeThrough {
    poolId: string;
    from: string;
    to: string;
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

    static async swap(user: IUser, traderProfile: IUserTraderProfile, inputMint: string, outputMint: string, inputAmount: BN, slippage: number, poolId?: string, fee?: number): Promise<{ swapAmountInLamports: number, tx: web3.VersionedTransaction, blockhash: string }> {
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
        const currency = Currency.SOL;

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
                    if (pool){
                        this.tradeThroughSonic[tokenMint] =  this.buildTradeThroughSonic(tokenMint, pool.poolId);
                    }
                }

                if (inputMint == kSolAddress && this.tradeThroughSonic[outputMint]){
                    tradeThrough = this.tradeThroughSonic[outputMint];
                }
                else if (outputMint == kSolAddress && this.tradeThroughSonic[inputMint]){
                    tradeThrough = this.tradeThroughSonic[inputMint];
                    tradeThrough = tradeThrough.reverse();
                    for (const trade of tradeThrough) {
                        const tmp = trade.from;
                        trade.from = trade.to;
                        trade.to = tmp;
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
        let swapAmountInLamports = inputMint == kSolAddress ? inputAmount.toNumber() : 0;
        let tradeIndex = 0;
        let prevSwapResult: SwapResult | undefined = undefined;
        const isBuyTrade = inputMint == kSolAddress;

        for (const trade of tradeThrough) {
            const data = await sega.cpmm.getPoolInfoFromRpc(trade.poolId);
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
            const swapResult = CurveCalculator.swap(
                sourceAmount,
                baseIn ? rpcData.baseReserve : rpcData.quoteReserve,
                baseIn ? rpcData.quoteReserve : rpcData.baseReserve,
                rpcData.configInfo!.tradeFeeRate
            );

            if (outputMint == kSolAddress && trade.to == kSolAddress){
                swapAmountInLamports = swapResult.destinationAmountSwapped.toNumber();
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

            const swapSlippage = (tradeThrough.length > 1 && tradeIndex == 0 && !isBuyTrade) ? 0 : slippage / 100; // it should be 0 only for the first trade when multiple trades, and only for SELL trades

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

            prevSwapResult = swapResult;
            tradeIndex++;
        }

        if (!txBuilder){
            throw new BadRequestError('Tx builder not found');
        }

        // add 1% fee instruction to tx
        const feeIx = SwapManager.createFeeInstruction(this.chain, +swapAmountInLamports, tpWallet.publicKey, currency, fee);
        txBuilder.addInstruction({
            endInstructions: [feeIx],
        });

        // console.log('buildProps:', buildProps);

        const blockhash = (await SolanaManager.getRecentBlockhash(this.chain)).blockhash;
        const result = await txBuilder.buildV0({
            recentBlockhash: blockhash,
            lookupTableAddress: txBuildProps?.lookupTableAddress,
            lookupTableCache: txBuildProps?.lookupTableCache,
        });

        const tx = result.transaction;
        return { swapAmountInLamports, tx, blockhash };
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