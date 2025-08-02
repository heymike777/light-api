import * as ChaosSonic from "@heymike/chaosfinance";
import * as ChaosSVM from "@heymike/chaosfinance-svm";
import { Keypair } from "@solana/web3.js";
import { Chain, Status } from "../types";
import { kSonicAddress } from "../Constants";
import { ChaosStakeTx } from "../../../entities/staking/ChaosStakeTx";
import { Transaction } from "@solana/web3.js";
import { SolanaManager } from "../SolanaManager";

export interface IChaosToken {
    chain: Chain;
    mint: string;
    symbol: string;
    minStakeAmount: number;
    stake: { programId: string, stakeManagerAddress: string };
}

export class ChaosManager {

    static kProjectId = 'light-app';
    static kLsdProgramId = '3xkSoc4PeFJ8FmVeanwdsKzaByrX6CTNyVTskHe5XCyn'; // for SONIC
    static kStakeVaultProgramId = 'G4wEnUJZabnFfH3gjzAtTdm6co1nar1eC72EDLz97Mzh'; // for CHILL & FOMO & other tokens

    static kSupportedTokens: { [key: string]: IChaosToken } = {
        'mrujEYaN1oyQXDHeYNxBYpxWKVkQ2XsGxfznpifu4aL': { 
            chain: Chain.SONIC,
            mint: 'mrujEYaN1oyQXDHeYNxBYpxWKVkQ2XsGxfznpifu4aL',
            symbol: 'SONIC',
            stake: {
                'programId': this.kLsdProgramId,
                'stakeManagerAddress': '6CD17Q4xQVoGktQADZLQXwVife7e8WXn8rzqkgb337hb',
            },
            minStakeAmount: 1,
        },
        '7yt6vPUrSCxEq3cQpQ6XKynttH5MMPfT93N1AqnosyQ3': {
            chain: Chain.SONIC,
            mint: '7yt6vPUrSCxEq3cQpQ6XKynttH5MMPfT93N1AqnosyQ3',
            symbol: 'CHILL',
            stake: {
                'programId': this.kStakeVaultProgramId,
                'stakeManagerAddress': '2n8iJYxsPNDXbHnux1vhvgG6syZKkN36jMFpCWAFVdBN',
            },
            minStakeAmount: 30, // min 30 CHILL to stake
        },
    };

    static async stake(keypair: Keypair, mint: string, amount: number) {
        const token = this.kSupportedTokens[mint];
        if (!token){
            throw new Error(`Token ${mint} not supported`);
        }

        if (amount < token.minStakeAmount){
            throw new Error(`Minimum stake amount is ${token.minStakeAmount} ${token.symbol}`);
        }

        const balance = await SolanaManager.getWalletSolBalance(token.chain, keypair.publicKey.toString());
        if (balance && balance.uiAmount < 0.01){
            throw new Error(`Insufficient SOL balance: ${balance} SOL. You need at least 0.01 SOL to stake`);
        }

        const tokenBalance = await SolanaManager.getWalletTokenBalance(token.chain, keypair.publicKey.toString(), token.mint);
        if (tokenBalance && tokenBalance.uiAmount < amount){
            throw new Error(`Insufficient ${token.symbol} balance: ${tokenBalance} ${token.symbol}`);
        }

        let txHash: string | undefined;
        if (mint == kSonicAddress){
            txHash = await this.stakeSonic(keypair, token, amount);
        }
        else {
            txHash = await this.stakeToken(keypair, token, amount);
        }

        if (txHash){
            await ChaosStakeTx.create({
                walletAddress: keypair.publicKey.toString(),
                amount: amount,
                mint: token.mint,
                signature: txHash,
            });
        }
    }

    static async stakeSonic(keypair: Keypair, token: IChaosToken, amount: number): Promise<string | undefined> {
        const config: ChaosSonic.SonicLSDConfig = {
            restEndpoint: process.env.SONIC_RPC!,
            lsdProgramId: token.stake.programId,
            stakeManagerAddress: token.stake.stakeManagerAddress,
            projectId: this.kProjectId,
        };

        console.log('config', config);

        const chaos = new ChaosSonic.SonicLSD(config);
        chaos.setKeypair(keypair);

        // wait while SDK loads sonicTokenMintAddress and lsdTokenMintAddress. check every 100ms, but max 30s
        const startTime = Date.now();
        while (Date.now() - startTime < 30000) {
            const programIds = chaos.getClient().getProgramIds();
            if (programIds.sonicTokenMintAddress && programIds.sonicTokenMintAddress!='' && programIds.lsdTokenMintAddress && programIds.lsdTokenMintAddress!='') {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        try {
            const txHash = await chaos.getStaking().stakeSonic(amount);
            return txHash;
        } catch (error: any) {
            console.error('❌ Error:', error);
            throw error;
        }
    }

    static async stakeToken(keypair: Keypair, token: IChaosToken, amount: number): Promise<string | undefined> {
        const provider: ChaosSVM.SolanaProvider = {
            restEndpoint: process.env.SONIC_RPC!,
            ...this.makeSigner(keypair),
        };
        const programIds: ChaosSVM.ProgramIds = {
            lsdProgramId: token.stake.programId,
            stakeManagerAddress: token.stake.stakeManagerAddress,
        };

        const chaos = new ChaosSVM.LsdClient(provider, programIds, this.kProjectId);
    
        try {        
            const txHash = await chaos.stakeToken(amount);
            return txHash;
        } catch (error: any) {
            console.error('❌ Error:', error);
            throw error;
        }
    }

    /*
    * Utility: convert a generated Keypair into the signer interface
    * expected by the SDK.  In real projects you would load an existing
    * keypair (file, env, secret-manager, …) instead of generating one.
    */
    static makeSigner = (kp: Keypair) => ({
        signTransaction: async (tx: Transaction) => {
            tx.sign(kp);
            return tx;
        },
        signAllTransactions: async (txs: Transaction[]) => {
            txs.forEach((tx) => tx.sign(kp));
            return txs;
        },
        publicKey: kp.publicKey,
    });

    static async receivedConfirmationForSignature(chain: Chain, signature: string) {
        const stakeTx = await ChaosStakeTx.findOne({ chain: chain, signature: signature });
        if (!stakeTx) {
            return;
        }

        stakeTx.status = Status.COMPLETED;
        await ChaosStakeTx.updateOne({ _id: stakeTx._id, status: {$ne: stakeTx.status} }, { $set: { status: stakeTx.status } });
    }

    static async checkPendingStakes() {
        const chain = Chain.SONIC;
        const stakes = await ChaosStakeTx.find({ status: Status.CREATED, createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) } });
        for (const stake of stakes) {
            const tx = await SolanaManager.getParsedTransaction(chain, stake.signature);
            if (tx && !tx.meta?.err) {
                stake.status = Status.COMPLETED;
                await ChaosStakeTx.updateOne({ _id: stake._id, status: {$ne: stake.status} }, { $set: { status: stake.status } });
            }
        }
    }

}