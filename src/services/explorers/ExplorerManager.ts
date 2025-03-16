import { getRpc } from "../solana/lib/solana";
import { Chain } from "../solana/types";

export class ExplorerManager {

    static getUrlToAddress(chain: Chain, address: string): string {
        if (chain === Chain.SOLANA){
            return `https://solscan.io/address/${address}`;
        }

        return `https://solscan.io/address/${address}?cluster=custom&customUrl=${getRpc(chain).http}`;
    }

    static getUrlToTransaction(chain: Chain, signature: string): string {
        if (chain === Chain.SOLANA){
            return `https://solscan.io/tx/${signature}`;
        }

        return `https://solscan.io/tx/${signature}?cluster=custom&customUrl=${getRpc(chain).http}`;
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

    static getDexscreenerTokenUrl(mint: string, chain: Chain): string | undefined {
        if (chain === Chain.SOLANA) {
            return `https://dexscreener.com/solana/${mint}?ref=lightdotapp`;
        }
    }

    static getBubblemapsTokenUrl(mint: string, chain: Chain): string | undefined {
        if (chain === Chain.SOLANA) {
            return `https://app.bubblemaps.io/sol/token/${mint}`;
        }
    }

    static getTokenReflink(mint: string, refcode?: string, bot = 'lightdotapp_bot'): string {
        if (refcode) {
            return `https://t.me/${bot}?start=r-${refcode}-ca-${mint}`;
        }
        
        return `https://t.me/${bot}?start=sell-${mint}`;
    }

    

}