import { PreWallet } from "../entities/PreWallet";
import { SolanaManager } from "../services/solana/SolanaManager";

export class WalletGeneratorManager {
    static startsWith?: string = undefined;
    static endsWith?: string = 'LAPP';

    static async start() {
        console.log('WalletGeneratorManager', 'start');

        while (true) {
            const wallet = SolanaManager.createWallet();
            // console.log('Wallet generated:', wallet.publicKey);
            if ((!this.startsWith || wallet.publicKey.startsWith(this.startsWith))
                && (!this.endsWith || wallet.publicKey.endsWith(this.endsWith))
            ) {

                const preWallet = new PreWallet();
                preWallet.publicKey = wallet.publicKey;
                preWallet.privateKey = wallet.privateKey;
                preWallet.isUsed = false;
                preWallet.createdAt = new Date();
                await preWallet.save();

                console.log('PreWallet saved:', preWallet.publicKey);
            }
        }
    }

}