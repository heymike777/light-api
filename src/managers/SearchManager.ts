import { ITokenModel, Token, tokenToTokenModel } from "../entities/tokens/Token";
import { SolanaManager } from "../services/solana/SolanaManager";
import { Chain } from "../services/solana/types";
import { TokenManager } from "./TokenManager";

export class SearchManager {

    static async search(query: string, userId: string): Promise<ITokenModel[]> {
        let mint: string | undefined = undefined;
        let pairId: string | undefined = undefined;

        // check if query is a valid token mint address
        const isValidPublicKey = SolanaManager.isValidPublicKey(query);
        if (isValidPublicKey){
            mint = query;
            pairId = query;
        }
        
        // pump.fun link
        if (!mint && !pairId && query.startsWith('https://pump.fun/coin/')){
            const queryTmp = query.replace('https://pump.fun/coin/', '');
            const parts = queryTmp.split('?');
            if (parts.length > 0){
                mint = parts[0];
            }
        }

        // dexscreener link = https://dexscreener.com/solana/6ofwm7kplfxnwmb3z5xwboxnspp3jjyirapqpsivcnsp?t=1739912495229 
        // where id is token pair address
        if (!mint && !pairId && query.startsWith('https://dexscreener.com/solana/')){
            const queryTmp = query.replace('https://dexscreener.com/solana/', '');
            const parts = queryTmp.split('?');
            if (parts.length > 0){
                pairId = parts[0];
            }
        }
                
        // dextools link = https://www.dextools.io/app/en/solana/pair-explorer/7rdaE1HNeBKxdyCQ4z9tNaYrYH4goFEQo3kCWA4nVrQg?t=1739912495229
        // where id is token pair address
        if (!mint && !pairId && query.startsWith('https://www.dextools.io/app/en/solana/pair-explorer/')){
            const queryTmp = query.replace('https://www.dextools.io/app/en/solana/pair-explorer/', '');
            const parts = queryTmp.split('?');
            if (parts.length > 0){
                pairId = parts[0];
            }
        }

        const tokens: ITokenModel[] = [];

        if (mint){
            const token = await TokenManager.getToken(Chain.SOLANA, mint);
            if (token){
                tokens.push(token);
            }
        }
        
        if (pairId){
            const pairTokens = await TokenManager.getTokensByPair(Chain.SOLANA, pairId);
            if (pairTokens && pairTokens.length > 0){
                tokens.push(...pairTokens);
            }
        }
        
        if (tokens.length === 0){
            const tmpTokens = await Token.find({ symbol: { $regex : new RegExp(query, "i") } });
            if (tmpTokens && tmpTokens.length > 0){
                tokens.push(...(tmpTokens.map(token => tokenToTokenModel(token))));
            }
        }

        return tokens;
    }

}