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
import { API_URLS, CobaltX, TxVersion, getApiUrl } from '@cobaltx/sdk-v2';
import { NetworkName } from "@cobaltx/sdk-v2/lib/config";
import { Keypair } from '@solana/web3.js';
import { Connection } from '@solana/web3.js';
import Decimal from 'decimal.js';
import axios from 'axios';
import { VersionedTransaction } from '@solana/web3.js';
import { PublicKey } from '@solana/web3.js';
import base58 from "bs58";

export class CobaltxManager {

    static async initSdk(params: {
        chain: Chain;
        owner: Keypair;
        conn: Connection;
        loadToken?: boolean;
    }): Promise<CobaltX> {

        let network: NetworkName;
        switch (params.chain) {
            case Chain.SOON_MAINNET:
                network = NetworkName.sooneth;
                break;
            case Chain.SVMBNB_MAINNET:
                network = NetworkName.svmbnb;
                break;
            case Chain.SOONBASE_MAINNET:
                network = NetworkName.soonbase_mainnet;
                break;
            default:
                network = NetworkName.sooneth;
                break;
        }

        const cobaltx = await CobaltX.load({
            owner: params.owner,
            connection: params.conn,
            cluster: 'mainnet',
            disableFeatureCheck: true,
            disableLoadToken: !params?.loadToken,
            blockhashCommitment: 'confirmed',
            network: network,
        });

        return cobaltx;
    }

    // static async swap2({ cobaltx, inputMint, inputAmount, outputMint, slippage, owner }: {
    //     cobaltx: CobaltX;
    //     inputMint: string;
    //     outputMint: string;
    //     inputAmount: BN;
    //     slippage: number;
    //     owner: Keypair;
    // }) {
    //     const swapComputeUrl =
    //         inputMint && outputMint && !new Decimal(inputAmount.toString() || 0).isZero()
    //         ? `${getApiUrl(NetworkName.sooneth).SWAP_HOST}${API_URLS.SWAP_COMPUTE}swap-base-in?inputMint=${inputMint}&outputMint=${outputMint}&amount=${inputAmount.toString()}&slippageBps=${slippage}&txVersion=V0`
    //         : null;

    //     if (!swapComputeUrl) {
    //         throw new Error("Swap compute url generation failed");
    //     }

    //     const computeSwapResponse = await axios.get(swapComputeUrl).then((res) => res.data).catch((err) => {
    //         console.error(err)
    //         throw new Error("Swap compute failed");
    //     })

    //     const inputToken = await cobaltx.token.getTokenInfo(new PublicKey(inputMint))
    //     const outputToken = await cobaltx.token.getTokenInfo(new PublicKey(outputMint))

    //     const inputTokenAcc = await cobaltx.account.getCreatedTokenAccount({
    //         programId: new PublicKey(inputToken.programId ?? "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5D"),
    //         mint: new PublicKey(inputToken.address),
    //         associatedOnly: false
    //     })

    //     const outputTokenAcc = await cobaltx.account.getCreatedTokenAccount({
    //         programId: new PublicKey(outputToken.programId ?? "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5D"),
    //         mint: new PublicKey(outputToken.address)
    //     })

    //     const buildTxResponse = await axios.post(
    //         `${getApiUrl(NetworkName.sooneth).SWAP_HOST}${API_URLS.SWAP_TX}swap-base-in`,
    //         {
    //             wallet: owner.publicKey.toBase58(),
    //             computeUnitPriceMicroLamports: Number((computeSwapResponse.data?.microLamports || 0).toFixed(0)),
    //             swapResponse: computeSwapResponse.data,
    //             txVersion: 'V0',
    //             wrapSol: true,
    //             unwrapSol: true,
    //             inputAccount: inputTokenAcc,
    //             outputAccount: outputTokenAcc
    //         }
    //     ).then((res) => res.data).catch((err) => {
    //         console.error(err)
    //         throw new Error("Swap transaction generation failed");
    //     })
    //     const swapTransactions = buildTxResponse.data || []
    //     const allTxBuf = swapTransactions.map((tx: any) => base58.decode(tx.transaction))
    //     const allTx = allTxBuf.map((txBuf: any) => new VersionedTransaction(web3.VersionedMessage.deserialize(Uint8Array.from(txBuf))))

    //     const signedTransactions = allTx.map((tx: VersionedTransaction) => {
    //         tx.sign([owner]);
    //         return tx;
    //     });

    //     // await sendTxn(
    //     //     Promise.all(signedTransactions.map((tx: VersionedTransaction) => conn.sendTransaction(tx))),
    //     //     `Swap from ${inputMint} to ${outputMint}`
    //     // );
    // }

    static async swap(chain: Chain, user: IUser, traderProfile: IUserTraderProfile, inputMint: string, outputMint: string, inputAmount: BN, slippage: number): Promise<{ swapAmountInLamports: number, tx: web3.VersionedTransaction, blockhash: string }> {
        console.log('CobaltxManager', 'swap', 'chain:', chain, 'inputMint:', inputMint, 'outputMint:', outputMint, 'inputAmount:', inputAmount.toString(), 'slippage:', slippage);
        
        const tpWallet = traderProfile.getWallet();
        if (!tpWallet) {
            throw new Error('Wallet not found');
        }
        const fee = SwapManager.getFeeSize(user);

        // console.log('CobaltxManager', 'swap', 'chain:', chain, 'inputMint:', inputMint, 'outputMint:', outputMint, 'inputAmount:', inputAmount.toString(), 'slippage:', slippage);

        const connection = newConnectionByChain(chain);
        const currency = Currency.SOL;

        const wallet = web3.Keypair.fromSecretKey(bs58.decode(tpWallet.privateKey))

        // ------

        const cobaltx = await CobaltxManager.initSdk({
            chain: chain,
            owner: wallet,
            conn: connection,
            loadToken: true
        });

        const swapComputeUrl =
            inputMint && outputMint && !new Decimal(inputAmount.toString() || 0).isZero()
            ? `${getApiUrl(NetworkName.sooneth).SWAP_HOST}${API_URLS.SWAP_COMPUTE}swap-base-in?inputMint=${inputMint}&outputMint=${outputMint}&amount=${inputAmount.toString()}&slippageBps=${slippage}&txVersion=V0`
            : null;

        if (!swapComputeUrl) {
            throw new Error("Swap compute url generation failed");
        }

        const computeSwapResponse = await axios.get(swapComputeUrl).then((res) => res.data).catch((err) => {
            console.error(err)
            throw new Error("Swap compute failed");
        })

        const inputToken = await cobaltx.token.getTokenInfo(new PublicKey(inputMint))
        const outputToken = await cobaltx.token.getTokenInfo(new PublicKey(outputMint))

        //TODO: does it create token accounts if they don't exist?? or only checks if they exist?
        const inputTokenAcc = await cobaltx.account.getCreatedTokenAccount({
            programId: new PublicKey(inputToken.programId ?? "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5D"),
            mint: new PublicKey(inputToken.address),
            associatedOnly: false
        })

        const outputTokenAcc = await cobaltx.account.getCreatedTokenAccount({
            programId: new PublicKey(outputToken.programId ?? "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5D"),
            mint: new PublicKey(outputToken.address)
        })

        const buildTxResponse = await axios.post(
            `${getApiUrl(NetworkName.sooneth).SWAP_HOST}${API_URLS.SWAP_TX}swap-base-in`,
            {
                wallet: wallet.publicKey.toBase58(),
                computeUnitPriceMicroLamports: Number((computeSwapResponse.data?.microLamports || 0).toFixed(0)),
                swapResponse: computeSwapResponse.data,
                txVersion: 'V0',
                wrapSol: true,
                unwrapSol: true,
                inputAccount: inputTokenAcc,
                outputAccount: outputTokenAcc
            }
        ).then((res) => res.data).catch((err) => {
            console.error(err)
            throw new Error("Swap transaction generation failed");
        })
        const swapTransactions = buildTxResponse.data || []
        const allTxBuf = swapTransactions.map((tx: any) => base58.decode(tx.transaction))
        const allTx = allTxBuf.map((txBuf: any) => new VersionedTransaction(web3.VersionedMessage.deserialize(Uint8Array.from(txBuf))))

        const signedTransactions = allTx.map((tx: VersionedTransaction) => {
            tx.sign([wallet]);
            return tx;
        });

        console.log('CobaltxManager', 'swap', 'signedTransactions:', signedTransactions);

        throw new Error('CobaltxManager.swap is not implemented yet');

        // return { swapAmountInLamports, tx, blockhash };

        /*
        const sega = await Sega.load({
            cluster: 'mainnet',
            connection,
            owner: wallet,
            apiRequestInterval: 5 * 60 * 1000,
            apiRequestTimeout: 10 * 1000,
            apiCacheTime: 5 * 60 * 1000,
            blockhashCommitment: 'confirmed',
        });

        const pool = await this.fetchPoolForMints(chain, inputMint, outputMint);
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
        const feeIx = SwapManager.createFeeInstruction(chain, +swapAmountInLamports, tpWallet.publicKey, currency, fee);
        builder.addInstruction({
            endInstructions: [feeIx],
        });

        // console.log('buildProps:', buildProps);

        const blockhash = (await SolanaManager.getRecentBlockhash(chain)).blockhash;
        const result = await builder.buildV0({
            recentBlockhash: blockhash,
            lookupTableAddress: buildProps?.lookupTableAddress,
            lookupTableCache: buildProps?.lookupTableCache,
        });

        const tx = result.transaction;
        return { swapAmountInLamports, tx, blockhash };
        */
    }

    // static async fetchPoolForMints(chain: Chain, mintA: string, mintB: string): Promise<{poolId: string} | undefined> {
    //     const existing = await TokenPair.findOne({
    //         chain: chain,
    //         $or: [
    //             { token1: mintA, token2: mintB },
    //             { token1: mintB, token2: mintA },
    //         ]
    //     });
    //     if (existing) {
    //         // console.log('Pool already exists in DB:', existing);
    //         return { poolId: existing.pairAddress };
    //     }

    //     let page = 1;
    //     const pageSize = 100;
    //     while (page < 10){
    //         const url = `https://api.sega.so/api/pools/info/list?poolType=all&poolSortField=default&sortType=desc&pageSize=${pageSize}&page=${page}`;
    //         const response = await fetch(url);
    //         if (!response.ok) {
    //             return undefined;
    //         }

    //         const data: any = await response.json();
    //         if (data && data.data && data.data.data) {
    //             const pools = data.data.data;
    //             // console.log('Page:', page, 'Pools:', pools);
    //             // console.log('mintA:', mintA, 'mintB:', mintB);
    //             for (const pool of pools) {
    //                 if ((pool.mintA.address == mintA && pool.mintB.address == mintB) || (pool.mintA.address == mintB && pool.mintB.address == mintA)) {
    //                     await TokenManager.createTokenPair(chain, pool.id, pool.mintA.address, pool.mintB.address, undefined, undefined, kProgram.SEGA, pool.lpMint.address);
                        
    //                     return { poolId: pool.id };
    //                 }
    //             }

    //             if (pools.length < pageSize){
    //                 // No more pools to fetch
    //                 break;
    //             }
    //         }
    //         else {
    //             break;
    //         }

    //         page++;
    //     }
    // }

}