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
import { TransactionInstruction } from '@solana/web3.js';
import { TransactionMessage } from '@solana/web3.js';

export class CobaltxManager {

    static async initSdk(params: {
        chain: Chain;
        owner: Keypair;
        conn: Connection;
        loadToken?: boolean;
    }): Promise<CobaltX> {

        const network = CobaltxManager.getNetworkName(params.chain);

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

    static getNetworkName(chain: Chain): NetworkName {
        let network: NetworkName;
        switch (chain) {
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
        return network;
    }

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
        const network = CobaltxManager.getNetworkName(chain);

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
            ? `${getApiUrl(network).SWAP_HOST}${API_URLS.SWAP_COMPUTE}swap-base-in?inputMint=${inputMint}&outputMint=${outputMint}&amount=${inputAmount.toString()}&slippageBps=${slippage}&txVersion=V0`
            : null;

        if (!swapComputeUrl) {
            throw new Error("Swap compute url generation failed");
        }

        const computeSwapResponse = await axios.get(swapComputeUrl).then((res) => res.data).catch((err) => {
            console.error(err)
            throw new Error("Swap compute failed");
        });

        console.log('CobaltxManager', 'swap', 'computeSwapResponse:', JSON.stringify(computeSwapResponse, null, 2));

        const swapAmountInLamports = inputMint == kSolAddress ? inputAmount.toNumber() : computeSwapResponse.data.outputAmount.toNumber();


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
        });

        const buildTxResponse = await axios.post(
            `${getApiUrl(network).SWAP_HOST}${API_URLS.SWAP_TX}swap-base-in`,
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
        console.log('CobaltxManager', 'swap', 'buildTxResponse:', JSON.stringify(buildTxResponse, null, 2));    
        const swapTransactions = buildTxResponse.data || [];
        
        if (swapTransactions.length === 0) {
            throw new Error('No transactions generated for swap');
        }

        if (swapTransactions.length > 1) {
            console.warn('CobaltxManager.swap', 'Multiple transactions generated for swap, only the first one will be signed and sent');
            throw new Error('Multiple transactions generated for swap. Please try again or contact support.');
        }

        const txData = await SolanaManager.extractTransactionComponents(connection, swapTransactions[0].transaction)

        // const allTxBuf = swapTransactions.map((tx: any) => base58.decode(tx.transaction))
        // const allTx: VersionedTransaction[] = allTxBuf.map((txBuf: any) => new VersionedTransaction(web3.VersionedMessage.deserialize(Uint8Array.from(txBuf))))

        // const tx = allTx[0];
        // console.log('CobaltxManager', 'swap', 'tx:', tx);
        // console.log('CobaltxManager', 'swap', 'txJSON:', JSON.stringify(tx, null, 2));

        // const message = tx.message;
        // // Extract instructions from compiled form
        // const instructions: TransactionInstruction[] = message.compiledInstructions.map((ci) => {
        //     const programId = message.staticAccountKeys[ci.programIdIndex];
        //     const keys = ci.accountKeyIndexes.map((i) => ({
        //         pubkey: message.staticAccountKeys[i],
        //         isSigner: message.isAccountSigner(i),
        //         isWritable: message.isAccountWritable(i),
        //     }));
        //     console.log('CobaltxManager', 'swap', 'ci:', ci, 'programId:', programId.toBase58(), '!keys:', keys);
        //     return new TransactionInstruction({
        //         programId,
        //         keys,
        //         data: Buffer.from(ci.data),
        //     });
        // });

        // // const addressLookupTableAccounts: web3.AddressLookupTableAccount[] | undefined = message.addressTableLookups;
        // let lookups: web3.AddressLookupTableAccount[] | undefined = undefined;
        // if (message.addressTableLookups && message.addressTableLookups.length > 0){
        //     const lookupsAccountKeys = message.addressTableLookups.map((lookup) => lookup.accountKey.toBase58());
        //     lookups = await SolanaManager.getAddressLookupTableAccounts(connection, lookupsAccountKeys);
        // }

        // const txMessage = new TransactionMessage({
        //     payerKey: wallet.publicKey,
        //     recentBlockhash: message.recentBlockhash,
        //     instructions: [...instructions],
        // });

        // //TODO: add fee instruction
        // // const feeIx = SwapManager.createFeeInstruction(chain, +swapAmountInLamports, tpWallet.publicKey, currency, fee);
        // // builder.addInstruction({
        // //     endInstructions: [feeIx],
        // // });

        const txMessage = new TransactionMessage({
            payerKey: wallet.publicKey,
            recentBlockhash: txData.blockhash,
            instructions: txData.instructions,
        });
        const lookups = txData.lookups;
        // console.log('CobaltxManager', 'swap', 'allTx:', allTx);

        const compiledMessage = txMessage.compileToV0Message(lookups);
        const newVersionedTx = new VersionedTransaction(compiledMessage);

        // console.log('CobaltxManager', 'swap', 'oldTx:', tx);
        console.log('CobaltxManager', 'swap', 'newTx:', newVersionedTx);

        throw new Error('CobaltxManager.swap is not implemented yet');

        return { 
            swapAmountInLamports, 
            tx: newVersionedTx, 
            blockhash: txData.blockhash,
        };

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