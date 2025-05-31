import { newConnection, newConnectionByChain } from "../../services/solana/lib/solana";
import { Chain, ChainConfig, kChains } from "../../services/solana/types";
import { Connection } from '@solana/web3.js';
import { LogManager } from "../LogManager";
import { MicroserviceManager } from "../MicroserviceManager";
import { SolanaManager } from "../../services/solana/SolanaManager";
import { PublicKey } from "@solana/web3.js";

export class SvmManager {
    id: string;
    chain: Chain;
    chainConfig: ChainConfig;
    connection: Connection;
    static svms: SvmManager[] = [];

    POLL_MS   = 1000;                   // how often to poll
    TTL_MS    = 10 * 60 * 1000;        // 10-minute retention
    FIREHOSE  = new PublicKey("SysvarRecentB1ockHashes11111111111111111111"); // constant churn address works on all SVM chains
    seen  = new Map<string, number>(); // sig → first-seen timestamp

    constructor(chain: Chain){
        this.chain = chain;
        this.id = chain;
        this.chainConfig = kChains[chain];
        this.connection = newConnectionByChain(this.chain);

        SvmManager.svms.push(this);
    }

    async subscribe() {
        console.log('Subscribing to logs for chain:', this.chain);

        if (this.chainConfig.tracker?.useWss){
            const subscriptionId = this.connection.onLogs('all', async (logInfo) => {
                const { signature } = logInfo;
                
                console.log(`New transaction observed (${this.chain}): ${signature}`);

                await this.processTransaction(signature);
            });
        }

        if (this.chainConfig.tracker?.useHttp) {
            setInterval(async () => {
                try {
                    await this.poll();
                } catch (err) {
                    LogManager.error(`Error in SvmManager.poll for ${this.chain}:`, err);
                }
            }, this.POLL_MS);  
        }
    }

    async poll() {
        const now = Date.now();

        // 1️⃣  Evict signatures older than 10 min
        for (const [sig, firstSeen] of this.seen) {
            if (now - firstSeen > this.TTL_MS) this.seen.delete(sig);
        }

        // 2️⃣  Fetch the newest N signatures (adjust limit to your budget)
        const sigs = await this.connection.getSignaturesForAddress(this.FIREHOSE, { limit: 256 });

        for (const s of sigs) {
            if (this.seen.has(s.signature)) continue;   // already processed (and still fresh)

            this.seen.set(s.signature, now);            
            
            await this.processTransaction(s.signature);
        }
    }

    async processTransaction(signature: string) {
        try {
            const parsedTx = await SolanaManager.getParsedTransaction(this.chain, signature);

            if (parsedTx && !parsedTx.meta?.err) {

                //TODO: check if parsedTx has any of our tracking wallets in it

                MicroserviceManager.receivedTx(this.id, signature, JSON.stringify(parsedTx));
            } 
        } catch (err) {
            LogManager.error(`Error fetching transaction ${signature}:`, err);
        }
    }

    async resubscribeAll(){
        //TODO: should I just refresh wallets list? Or no need to do anything?
    }


}