import axios from "axios";
import { Chain } from "../services/solana/types";
import { LogManager } from "./LogManager";
import { JupiterManager } from "./JupiterManager";
import { HeliusManager } from "../services/solana/HeliusManager";
import { TokenManager } from "./TokenManager";
import { RedisManager } from "./db/RedisManager";

export class TokenPriceManager {

    static cache: { [key: string]: { address: string, price: number, date: Date }[] } = {}; // key == chain

    static async getTokensPrices(chain: Chain, mints: string[]): Promise<{address: string, price: number}[]>{
        if (mints.length === 0) {
            return [];
        }

        const prices: {address: string, price: number}[] = [];
        try {
            const cachedPrices = await this.getPricesFromCache(chain, mints);
            if (cachedPrices.length > 0){
                prices.push(...cachedPrices);
            }
            mints = mints.filter(mint => !cachedPrices.map(price => price.address).includes(mint));

            if (chain == Chain.SOLANA){
                // fetch from Raydium
                if (mints.length > 0){
                    const tmpPrices = await this.getPricesFromRaydium(mints);
                    if (tmpPrices.length > 0){
                        prices.push(...tmpPrices);
                    }
                    mints = mints.filter(mint => !tmpPrices.map(price => price.address).includes(mint));
                }
                   
                // fetch from Helius
                // if (mints.length > 0){
                //     const tmpPrices = await this.getPricesFromHelius(mints);
                //     if (tmpPrices.length > 0){
                //         prices.push(...tmpPrices);
                //     }
                //     mints = mints.filter(mint => !tmpPrices.map(price => price.address).includes(mint));
                // }

                // fetch from Jupiter
                // if (mints.length > 0){
                //     const tmpPrices = await this.getPricesFromJupiter(mints);
                //     if (tmpPrices.length > 0){
                //         prices.push(...tmpPrices);
                //     }
                //     mints = mints.filter(mint => !tmpPrices.map(price => price.address).includes(mint));
                // }
            }
            else if (chain == Chain.SONIC){
                // fetch token price from Sega
                if (mints.length > 0){
                    const tmpPrices = await this.getPricesFromSega(chain, mints);
                    if (tmpPrices.length > 0){
                        prices.push(...tmpPrices);
                    }
                    mints = mints.filter(mint => !tmpPrices.map(price => price.address).includes(mint));
                }
            }
        } catch (error) {
            // LogManager.error('Error in TokenPriceManager.getTokensPrices', error);
        }

        return prices;
    }

    static async cleanOldCache(){
        // remove all prices older than 1 minute
        const now = new Date();
        for (const chain in this.cache) {
            this.cache[chain] = this.cache[chain].filter(price => price.date.getTime() > now.getTime() - 1 * 60 * 1000);
        }
    }

    static async getPricesFromCache(chain: Chain, mints: string[]): Promise<{address: string, price: number}[]>{
        if (this.cache[chain]){
            const prices = this.cache[chain].filter(price => mints.includes(price.address));
            console.log('TokenPriceManager', 'getPricesFromCache', `found ${prices.length} prices`);
            return prices;
        }
        console.log('TokenPriceManager', 'getPricesFromCache', `found 0 prices`);
        return [];
    }

    static async savePricesToCache(chain: Chain, prices: {address: string, price: number}[]){
        if (!this.cache[chain]){
            this.cache[chain] = [];
        }
        for (const price of prices) {
            const index = this.cache[chain].findIndex(p => p.address == price.address);
            if (index > -1){
                this.cache[chain][index].price = price.price;
                this.cache[chain][index].date = new Date();
            }
            else {
                this.cache[chain].push({
                    address: price.address,
                    price: price.price,
                    date: new Date(),
                });
            }
        }
    }

    static async getPricesFromRaydium(mints: string[]): Promise<{address: string, price: number}[]>{
        const prices: {address: string, price: number}[] = [];
        try {
            const url = `https://api-v3.raydium.io/mint/price?mints=${mints.join(',')}`;
            const response = await axios.get(url);
            if (response.status === 200) {
                const data = response?.data?.data;
                if (data) {
                    for (const key in data) {
                        if (data[key]){
                            const price = +data[key];
                            if (price > 0){
                                prices.push({
                                    address: key,
                                    price: price,
                                });
                            }
                        }
                    }

                }
            }
        } catch (error: any) {
            // LogManager.error('Error in TokenPriceManager.getPricesFromRaydium', error);
            // SystemNotificationsManager.sendSystemMessage('TokenPriceManager.getPricesFromRaydium error:' + error.message);
        }

        console.log('TokenPriceManager', 'getPricesFromRaydium', `found ${prices.length} prices`);

        if (prices.length > 0){
            await this.savePricesToCache(Chain.SOLANA, prices);
        }

        return prices;
    }

    static async getPricesFromSega(chain: Chain, mints: string[]): Promise<{address: string, price: number}[]>{
        const prices: {address: string, price: number}[] = [];
        try {
            const url = `https://api.sega.so/api/mint/price?mints=${mints.join(',')}`;
            const response = await axios.get(url);
            if (response.status === 200) {
                const data = response?.data?.data;
                if (data) {
                    for (const key in data) {
                        if (data[key]){
                            const price = +data[key];
                            if (price > 0){
                                prices.push({
                                    address: key,
                                    price: price,
                                });
                            }
                        }
                    }

                }
            }
        } catch (error: any) {
            // LogManager.error('Error in TokenPriceManager.getPricesFromRaydium', error);
            // SystemNotificationsManager.sendSystemMessage('TokenPriceManager.getPricesFromRaydium error:' + error.message);
        }

        console.log('TokenPriceManager', 'getPricesFromSega', `found ${prices.length} prices`);

        if (prices.length > 0){
            await this.savePricesToCache(chain, prices);
        }

        return prices;
    }

    static async getPricesFromJupiter(mints: string[]): Promise<{address: string, price: number}[]>{
        const prices: {address: string, price: number}[] = [];
        try {
            const tmpPrices = await JupiterManager.getPrices(mints);
            if (tmpPrices.length > 0){
                prices.push(...tmpPrices);
            }
        } catch (error) {
            LogManager.error('Error in TokenPriceManager.getPricesFromJupiter', error);
        }

        console.log('TokenPriceManager', 'getPricesFromJupiter', `found ${prices.length} prices`);

        if (prices.length > 0){
            await this.savePricesToCache(Chain.SOLANA, prices);
        }

        return prices;
    }

    static async getPricesFromHelius(mints: string[]): Promise<{address: string, price: number}[]>{
        const prices: {address: string, price: number}[] = [];
        try {
            const tmpPrices = await HeliusManager.getTokensPrices(Chain.SOLANA, mints);
            if (tmpPrices.length > 0){
                prices.push(...tmpPrices);
            }
        } catch (error) {
            LogManager.error('Error in TokenPriceManager.getPricesFromHelius', error);
        }

        console.log('TokenPriceManager', 'getPricesFromHelius', `found ${prices.length} prices`);

        if (prices.length > 0){
            await this.savePricesToCache(Chain.SOLANA, prices);
        }

        return prices;
    }

    static async updateNativeTokenPrices(){
        const solPrice = await this.fetchTokenPriceOnBinance('SOL');
        if (solPrice!=undefined){
            TokenManager.solPrice = solPrice;
            await RedisManager.saveNativeTokenPrice(Chain.SOLANA, solPrice);
        }

        const ethPrice = await this.fetchTokenPriceOnBinance('ETH');
        if (ethPrice!=undefined){
            TokenManager.ethPrice = ethPrice;
            await RedisManager.saveNativeTokenPrice(Chain.SOON_MAINNET, ethPrice);
        }

        const bnbPrice = await this.fetchTokenPriceOnBinance('BNB');
        if (bnbPrice!=undefined){
            TokenManager.bnbPrice = bnbPrice;
            await RedisManager.saveNativeTokenPrice(Chain.SVMBNB_MAINNET, bnbPrice);
        }
    }


    static async fetchTokenPriceOnBinance(symbol: string): Promise<number | undefined> {
        const url = `https://www.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`;
        const response = await fetch(url);
        if (!response.ok) {
            return undefined;
        }

        const data: any = await response.json();
        const price = parseFloat(data.price);
        if (isNaN(price)) {
            return undefined;
        }
        return price;
    }
    

}