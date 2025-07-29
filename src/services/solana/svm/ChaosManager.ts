import { SonicLSD, SonicLSDConfig } from "@heymike/chaosfinance";
import { Keypair } from "@solana/web3.js";
import { Chain } from "../types";
import { kSonicAddress } from "../Constants";
import { ChaosStakeTx } from "../../../entities/staking/ChaosStakeTx";

export class ChaosManager {

    static kProjectId = 'light-app';
    static kLsdProgramId = '3xkSoc4PeFJ8FmVeanwdsKzaByrX6CTNyVTskHe5XCyn'; // FOR SONIC
    static kStakeVaultProgramId = 'G4wEnUJZabnFfH3gjzAtTdm6co1nar1eC72EDLz97Mzh'; // FOR CHILL & FOMO
    
    // https://docs.chaosfinance.xyz/docs/contract-addresses
    static kSupportedTokens: { [key: string]: { chain: Chain, mint: string, symbol: string, minStakeAmount: number, 'stake': { programId: string, stakeManagerAddress: string } } } = {
        'mrujEYaN1oyQXDHeYNxBYpxWKVkQ2XsGxfznpifu4aL': { 
            'chain': Chain.SONIC,
            'mint': 'mrujEYaN1oyQXDHeYNxBYpxWKVkQ2XsGxfznpifu4aL',
            'symbol': 'SONIC',
            'stake': {
                'programId': this.kLsdProgramId,
                'stakeManagerAddress': '6CD17Q4xQVoGktQADZLQXwVife7e8WXn8rzqkgb337hb',
            },
            minStakeAmount: 1,
        },
        // '7yt6vPUrSCxEq3cQpQ6XKynttH5MMPfT93N1AqnosyQ3': {
        //     'chain': Chain.SONIC,
        //     'mint': '7yt6vPUrSCxEq3cQpQ6XKynttH5MMPfT93N1AqnosyQ3',
        //     'symbol': 'CHILL',
        //     'stake': {
        //         'programId': this.kStakeVaultProgramId,
        //         'stakeManagerAddress': '2n8iJYxsPNDXbHnux1vhvgG6syZKkN36jMFpCWAFVdBN',
        //     }
        //     minStakeAmount: 30,
        // },
    };

    static async stake(keypair: Keypair, mint: string, amount: number): Promise<SonicLSD | undefined> {
        if (mint == kSonicAddress){
            return this.stakeSonic(keypair, mint, amount);
        }
        else {

        }
    }

    static async stakeSonic(keypair: Keypair, mint: string, amount: number): Promise<SonicLSD> {

        const token = this.kSupportedTokens[mint];
        if (!token){
            throw new Error(`Token ${mint} not supported`);
        }

        if (amount < token.minStakeAmount){
            throw new Error(`Minimum stake amount is ${token.minStakeAmount} ${token.symbol}`);
        }

        const stake = token.stake;

        const config: SonicLSDConfig = {
            restEndpoint: process.env.SONIC_RPC!,
            lsdProgramId: stake.programId,
            stakeManagerAddress: stake.stakeManagerAddress,
            projectId: this.kProjectId
        };

        const chaos = new SonicLSD(config);
        chaos.setKeypair(keypair);
        
        try {
            const balance = await chaos.getLST().getUserSolBalance();
            if (balance && parseFloat(balance) < 0.01){
                throw new Error(`Insufficient SOL balance: ${balance} SOL. You need at least 0.01 SOL to stake`);
            }

            if (token.mint == kSonicAddress){
                const sonicBalance = await chaos.getLST().getUserSonicBalance();
                console.log('sonicBalance', sonicBalance, 'amount', amount);
                if (sonicBalance && parseFloat(sonicBalance) < amount){
                    throw new Error(`Insufficient SONIC balance: ${sonicBalance} SONIC`);
                }    
            }
            else {
                //TODO: check balance of the token (CHILL, FOMO)
            }
        
            // console.log('📊 Getting platform information...');
            // const apr = await chaos.getLST().getLstApr();
            // const rate = await chaos.getLST().getLstRate();
            // const totalStaked = await chaos.getLST().getTotalStakedAmount();
            // const sonicBalance = await chaos.getLST().getUserSonicBalance();
            // const userStakedAmount = await chaos.getLST().getUserStakedAmount();
            
            // console.log(`Current APR: ${(apr || 0) * 100}%`);
            // console.log(`Current LST Rate: ${rate || '0'}`);
            // console.log(`Total Staked: ${totalStaked || '0'} SONIC\n`);
            // console.log(`User Sonic Balance: ${sonicBalance || '0'} SONIC`);
            // console.log(`User Staked Amount: ${userStakedAmount || '0'} SONIC`);

            console.log('🔄 Staking SONIC...');
            // const txHash = await chaos.getStaking().stakeSonic(amount, process.env.FEE_SOL_WALLET_ADDRESS!, 0.005);
            const txHash = await chaos.getStaking().stakeSonic(amount);
            console.log(`Keypair staking tx: ${txHash}`);
        

            await ChaosStakeTx.create({
                walletAddress: keypair.publicKey.toString(),
                amount: amount,
                mint: mint,
                signature: txHash,
            });

            // Get withdrawal info
            // console.log('📋 Getting withdrawal information...');
            // const withdrawInfo1 = await chaos.getStaking().getUserWithdrawInfo();
            // console.log('Keypair withdrawal info:', withdrawInfo1);
        } catch (error: any) {
            console.error('❌ Error:', error);
            throw error;
        }

        return chaos;
    }

}