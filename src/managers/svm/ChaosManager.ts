import * as ChaosVault from '@chaosfinance/svm-vault';
import { IUserTraderProfile } from '../../entities/users/TraderProfile';
import { PublicKey } from '@solana/web3.js';

export class ChaosManager {
    private readonly traderProfile: IUserTraderProfile;

    constructor(traderProfile: IUserTraderProfile) {
        this.traderProfile = traderProfile;
        if (!this.traderProfile.encryptedWallet?.publicKey){
            throw new Error('Public key is not set');
        }
        
        ChaosVault.register({
            restEndpoint: 'https://api.devnet.solana.com',
            signTransaction: async (tx) => {
                return tx;
            },
            signAllTransactions: async (txs) => {
                return txs;
            },
            publicKey: new PublicKey(this.traderProfile.encryptedWallet.publicKey),
        }, 'light.app');
    }


}