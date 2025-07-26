import { SonicLSD, SonicLSDConfig } from "@heymike/chaosfinance";
import { Keypair } from "@solana/web3.js";

export class ChaosManager {

    // https://docs.chaosfinance.xyz/docs/contract-addresses
    static kProjectId = 'light-app';
    static kLsdProgramId = '3xkSoc4PeFJ8FmVeanwdsKzaByrX6CTNyVTskHe5XCyn'; // FOR SONIC
    static kStakeManagerAddress = '6CD17Q4xQVoGktQADZLQXwVife7e8WXn8rzqkgb337hb';
    // static kStakeVaultLsdProgramId = 'G4wEnUJZabnFfH3gjzAtTdm6co1nar1eC72EDLz97Mzh'; // FOR CHILL & FOMO
    // static kChillStakeManagerAddress = '2n8iJYxsPNDXbHnux1vhvgG6syZKkN36jMFpCWAFVdBN';    

    static async init(keypair: Keypair): Promise<SonicLSD> {

        const config: SonicLSDConfig = {
            restEndpoint: process.env.SONIC_RPC!,
            lsdProgramId: this.kLsdProgramId,
            stakeManagerAddress: this.kStakeManagerAddress,
            projectId: this.kProjectId
        };

        console.log('🚀 Sonic LSD SDK - Node.js Multiple Keypairs Example\n');

        const chaos = new SonicLSD(config);    
        chaos.setKeypair(keypair);
        
        try {
            // Check if wallets are connected
            console.log('🔗 Checking wallet connections...');
            console.log(`Keypair connected: ${chaos.isWalletConnected()}`);
        
            // Get balances for both keypairs
            console.log('💰 Getting balances...');
            const balance = await chaos.getLST().getUserSolBalance();
        
            console.log(`Keypair SOL balance: ${balance || '0'} SOL`);
        
            // Get platform information
            console.log('📊 Getting platform information...');
            const apr = await chaos.getLST().getLstApr();
            const rate = await chaos.getLST().getLstRate();
            const totalStaked = await chaos.getLST().getTotalStakedAmount();
            const sonicBalance = await chaos.getLST().getUserSonicBalance();
            const userStakedAmount = await chaos.getLST().getUserStakedAmount();
            
            console.log(`Current APR: ${(apr || 0) * 100}%`);
            console.log(`Current LST Rate: ${rate || '0'}`);
            console.log(`Total Staked: ${totalStaked || '0'} SONIC\n`);
            console.log(`User Sonic Balance: ${sonicBalance || '0'} SONIC`);
            console.log(`User Staked Amount: ${userStakedAmount || '0'} SONIC`);

            console.log('🔄 Staking SONIC...');
            const txHash = await chaos.getStaking().stakeSonic(2);
            console.log(`Keypair staking tx: ${txHash}`);
        
            // Get withdrawal info
            // console.log('📋 Getting withdrawal information...');
            // const withdrawInfo1 = await chaos.getStaking().getUserWithdrawInfo();
            // console.log('Keypair withdrawal info:', withdrawInfo1);
        } catch (error: any) {
            console.error('❌ Error:', error);
        }

        return chaos;
    }

}