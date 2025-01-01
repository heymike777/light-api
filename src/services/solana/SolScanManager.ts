import axios from "axios"
import { TimeBasedValue } from "./types";
import { kSolAddress } from "./Constants";
import { TokenPair } from "../../entities/tokens/TokenPair";
import { SolanaManager } from "./SolanaManager";
import { newConnection } from "./lib/solana";
import { web3 } from "@coral-xyz/anchor";
import { LogManager } from "../../managers/LogManager";

export interface TokenInfo {
    mint: string;
    name?: string;
    symbol?: string;
    logo?: string;
    decimals?: number;
    holdersCount?: number;
    mintAuthority?: string;
    freezeAuthority?: string;
    supply?: string;
    price?: number;
    marketCap?: number;
    volume?: TimeBasedValue;
    priceChange?: TimeBasedValue;
}

export interface TokenMarket {
    poolId: string, 
    programId: string, 
    token1: string, 
    token2: string, 
    tokenAccount1: string, 
    tokenAccount2: string, 
}

export class SolScanManager {
    static baseUrl = 'https://pro-api.solscan.io/v2.0'

    static async sendGetApiRequest(method: string,  params: any): Promise<any> {
        try {
            const response = await axios.get(`${this.baseUrl}/${method}`, {
                params: params,
                headers: {
                    token: process.env.SOLSCAN_API_KEY,
                }
            });
            return response.data;
        }
        catch (error) {
            LogManager.error('SolScanManager', 'sendGetApiRequest', method, params, error);
        }
        return undefined;
    }

    static async fetchTokenInfo(mint: string): Promise<TokenInfo> {
        const response = await this.sendGetApiRequest('token/meta', { address: mint });

        const info: TokenInfo =  {
            mint: mint,
            name: response?.data?.name,
            symbol: response?.data?.symbol,
            logo: response?.data?.icon,
            decimals: response?.data?.decimals,
            holdersCount: response?.data?.holders,
            mintAuthority: response?.data?.mint_authority || undefined,
            freezeAuthority: response?.data?.freeze_authority || undefined,
            supply: response?.data?.supply,
            price: response?.data?.price,
            marketCap: response?.data?.market_cap,
            volume: {
                '24h': response?.data?.volume_24h ? Math.round(response?.data?.volume_24h) : undefined,
            },
            priceChange: {
                '24h': response?.data?.price_change_24h ? Math.round(response?.data?.price_change_24h * 100) / 100 : undefined,
            },
        };
        LogManager.log('SolScanManager', 'getTokenInfo', mint, info);
        return info;
    }

    static async fetchTokenMarkets(mint: string): Promise<TokenMarket[] | undefined> {

        let page = 1;
        const limit = 100;
        const markets: TokenMarket[] = [];
        while (page < 10){
            //TODO: should fetch USDC pools as well, and other tokens too, not only SOL
            const response = await this.sendGetApiRequest('token/markets', { token: [mint, kSolAddress], page_size: limit, sort_by: 'volume', page });
            const newMarkets = response?.data;
            if (newMarkets && newMarkets.length>0) { 
                for (const newMarket of newMarkets) {
                    markets.push({
                        poolId: newMarket.pool_id, 
                        programId: newMarket.program_id, 
                        token1: newMarket.token_1, 
                        token2: newMarket.token_2, 
                        tokenAccount1: newMarket.token_account_1, 
                        tokenAccount2: newMarket.token_account_2, 
                    });
                }
            }

            if (!newMarkets || newMarkets.length < limit){
                break;
            }

            page++;
        }

        LogManager.log('SolScanManager', 'fetchTokenMarkets', mint, markets);

        return markets;
    }

}