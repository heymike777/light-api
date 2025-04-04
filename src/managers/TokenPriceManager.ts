import { kSolAddress } from "../services/solana/Constants";
import { Chain } from "../services/solana/types";
import { LogManager } from "./LogManager";

export class TokenPriceManager {

    static async getTokensPrices(chain: Chain, mints: string[]): Promise<{address: string, price: number}[]>{
        if (mints.length === 0) {
            return [];
        }

        const prices: {address: string, price: number}[] = [];
        try {
            //TODO: check which prices I have in RAM
            if (chain == Chain.SOLANA){
                //TODO: fetch from Raydium API first
                //TODO: fetch from Jupiter API second

                if (mints.includes(kSolAddress)){
                    prices.push({address: kSolAddress, price: 123});
                }

                // const tmpPrices = await JupiterManager.getPrices(mints);
                // prices.push(...tmpPrices);
            }
        } catch (error) {
            LogManager.error('Error in TokenPriceManager.getTokensPrices', error);
        }


        return [];
    }

}