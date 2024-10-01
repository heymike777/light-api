export class ExplorerManager {

    static getUrlToAddress(address: string): string {
        return `https://solscan.io/address/${address}`;
    }

    static getUrlToTransaction(signature: string): string {
        return `https://solscan.io/tx/${signature}`;
    }
    
    static getUrlToRugCheck(address: string): string {
        return `https://rugcheck.xyz/tokens/${address}`;
    }

}