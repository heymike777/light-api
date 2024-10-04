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

    static getMarketplace(address: string): { title: string, url: string } {
        return {
            title: 'Tensor',
            url: `https://www.tensor.trade/item/${address}`
        }
    }

}