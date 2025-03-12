import { newConnection } from "../../services/solana/lib/solana";

export interface SVM {
    id: string;
    name: string;
    rpc: string;
    wss: string;
}

export const kSonicSvmMainnet: SVM = {
    id: 'sonic-mainnet',
    name: 'SONIC',
    rpc: 'https://sonic.helius-rpc.com/',
    wss: 'wss://sonic.helius-rpc.com/',
};

export class SvmManager {

    static async getTransaction(svm: SVM, signature: string){
        const connection = newConnection(svm.rpc);
        const tx = await connection.getParsedTransaction(signature, { commitment: 'confirmed' });
        return tx;
    }
    
}