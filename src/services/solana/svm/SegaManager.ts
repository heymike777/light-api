import { CurveCalculator, Network, Sega, TxVersion } from '@sega-so/sega-sdk';
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

export class SegaManager {

    static async swap(user: IUser, traderProfile: IUserTraderProfile, inputMint: string, outputMint: string, inputAmount: BN, slippage: number): Promise<{ swapAmountInLamports: number, tx: web3.VersionedTransaction, blockhash: string }> {
        const tpWallet = traderProfile.getWallet();
        if (!tpWallet) {
            throw new Error('Wallet not found');
        }
        const fee = SwapManager.getFeeSize(user);

        // console.log('SEGA', 'swap', 'inputMint:', inputMint, 'outputMint:', outputMint, 'inputAmount:', inputAmount.toString(), 'slippage:', slippage);

        const connection = newConnectionByChain(Chain.SONIC);
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

        const pool = await this.fetchPoolForMints(inputMint, outputMint);
        if (!pool) {
            throw new Error('Pool not found');
        }
        const poolId = pool.poolId;

        // Get pool information
        const data = await sega.cpmm.getPoolInfoFromRpc(poolId);
        const poolInfo = data.poolInfo;
        const poolKeys = data.poolKeys;
        const rpcData = data.rpcData;

        // Verify input mint matches pool
        if (inputMint !== poolInfo.mintA.address && inputMint !== poolInfo.mintB.address) {
            throw new Error('Input mint does not match pool');
        }

        // Calculate swap parameters
        const baseIn = inputMint === poolInfo.mintA.address;
        const swapResult = CurveCalculator.swap(
            inputAmount,
            baseIn ? rpcData.baseReserve : rpcData.quoteReserve,
            baseIn ? rpcData.quoteReserve : rpcData.baseReserve,
            rpcData.configInfo!.tradeFeeRate
        );

        const swapAmountInLamports = inputMint == kSolAddress ? inputAmount.toNumber() : swapResult.destinationAmountSwapped.toNumber();
        // console.log(`Swap amount in lamports: ${swapAmountInLamports}`);

        // Create and execute swap transaction
        // console.log('Creating swap transaction...', 'slippage:', slippage);
        const { builder, buildProps } = await sega.cpmm.swap({
            poolInfo,
            poolKeys,
            inputAmount,
            swapResult,
            slippage: slippage / 100, // range: 1 ~ 0.0001, means 100% ~ 0.01%
            baseIn,
            txVersion: TxVersion.V0,
        });

        // add 1% fee instruction to tx
        const feeIx = SwapManager.createFeeInstruction(Chain.SONIC, +swapAmountInLamports, tpWallet.publicKey, currency, fee);
        builder.addInstruction({
            endInstructions: [feeIx],
        });

        // console.log('buildProps:', buildProps);

        const blockhash = (await SolanaManager.getRecentBlockhash(Chain.SONIC)).blockhash;
        const result = await builder.buildV0({
            recentBlockhash: blockhash,
            lookupTableAddress: buildProps?.lookupTableAddress,
            lookupTableCache: buildProps?.lookupTableCache,
        });

        const tx = result.transaction;
        return { swapAmountInLamports, tx, blockhash };
    }

    static async fetchPoolForMints(mintA: string, mintB: string): Promise<{poolId: string} | undefined> {
        const existing = await TokenPair.findOne({
            chain: Chain.SONIC,
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
                        await TokenManager.createTokenPair(Chain.SONIC, pool.id, pool.mintA.address, pool.mintB.address, undefined, undefined, kProgram.SEGA, pool.lpMint.address);
                        
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

}