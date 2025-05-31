import { newConnection, newConnectionByChain } from "../../services/solana/lib/solana";
import { Chain } from "../../services/solana/types";
import { Connection } from '@solana/web3.js';
import { LogManager } from "../LogManager";
import { MicroserviceManager } from "../MicroserviceManager";
import { SolanaManager } from "../../services/solana/SolanaManager";

export class SvmManager {
    id: string;
    chain: Chain;
    static svms: SvmManager[] = [];

    constructor(chain: Chain){
        this.chain = chain;
        this.id = chain;

        SvmManager.svms.push(this);
    }

    async subscribe() {
        console.log('Subscribing to logs for chain:', this.chain);

        const connection = newConnectionByChain(this.chain);
        const subscriptionId = connection.onLogs('all', async (logInfo) => {
            const { signature } = logInfo;
            
            console.log(`New transaction observed (${this.chain}): ${signature}`);

            try {
                const parsedTx = await SolanaManager.getParsedTransaction(this.chain, signature);

                if (parsedTx && !parsedTx.meta?.err) {
                    MicroserviceManager.receivedTx(this.id, signature, JSON.stringify(parsedTx));
                } 
            } catch (err) {
                LogManager.error(`Error fetching transaction ${signature}:`, err);
            }
        });
    }

    async resubscribeAll(){
        //TODO: should I just refresh wallets list? Or no need to do anything?
    }


}