import { CurveCalculator, getConnection, Network, Sega, TxVersion } from '@heymike/sega-sdk';
import { PublicKey } from '@solana/web3.js';
import { Keypair } from '@solana/web3.js';
import { BN } from 'bn.js';

export class SegaManager {

    // static async test() {
    //     // Initialize connection and SDK
    //     const network = Network.SonicMainnet;
    //     const connection = getConnection(network);

    //     // Create or import a wallet
    //     const wallet = Keypair.generate(); // Or import from private key

    //     // Initialize Sega SDK
    //     const sega = await Sega.load({
    //         cluster: 'testnet',
    //         connection,
    //         owner: wallet,
    //         apiRequestInterval: 5 * 60 * 1000,
    //         apiRequestTimeout: 10 * 1000,
    //         apiCacheTime: 5 * 60 * 1000,
    //         blockhashCommitment: 'confirmed',
    //     });

    //     // Define token mint and pool
    //     const usdcMint = new PublicKey("8EdufEDLupX62qQaAMez9nFCXr5vKZ4w8tFgrJXAjTyk");
    //     const poolId = "BmaLNG7n6Aj4pfpUqaaGwyujEkhcoXBcuaPGwN71Wo2R";

    //     // Set input amount and mint
    //     const inputAmount = new BN(100);
    //     const inputMint = usdcMint.toBase58();

    //     // Get pool information
    //     const data = await sega.cpmm.getPoolInfoFromRpc(poolId);
    //     const poolInfo = data.poolInfo;
    //     const poolKeys = data.poolKeys;
    //     const rpcData = data.rpcData;

    //     // Verify input mint matches pool
    //     if (inputMint !== poolInfo.mintA.address && inputMint !== poolInfo.mintB.address) {
    //     throw new Error('Input mint does not match pool');
    //     }

    //     // Calculate swap parameters
    //     const baseIn = inputMint === poolInfo.mintA.address;
    //     const swapResult = CurveCalculator.swap(
    //         inputAmount,
    //         baseIn ? rpcData.baseReserve : rpcData.quoteReserve,
    //         baseIn ? rpcData.quoteReserve : rpcData.baseReserve,
    //         rpcData.configInfo!.tradeFeeRate
    //     );

    //     // Create and execute swap transaction
    //     const { builder, buildProps } = await sega.cpmm.swap({
    //         poolInfo,
    //         poolKeys,
    //         inputAmount,
    //         swapResult,
    //         slippage: 0.001, // range: 1 ~ 0.0001, means 100% ~ 0.01%
    //         baseIn,
    //         txVersion: TxVersion.V0,
    //     });

    //     //TODO: Send and confirm transaction

    //     console.log(`Swap transaction: https://explorer.sonic.game/${txId}?cluster=testnet.v1`);
    // }

}