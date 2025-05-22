import { Chain } from "./types";

export const kProgramIdRaydium = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
export const kRaydiumAmmFeesAccount = '7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5';
export const kRaydiumAuthority = '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1';

export const kSolAddress = 'So11111111111111111111111111111111111111112';
export const kUsdcAddress = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const kUsdcMintDecimals = 6;
export const kUsdtAddress = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
export const kJupAddress = 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN';

export const kPumpfunLiquidityWalletAddress = '39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg';

export interface IKToken { symbol: string, decimals: number, lamportsPerSol: number, name: string, logo: string };
const kTokenSol: IKToken = { symbol: 'SOL', decimals: 9, lamportsPerSol: 1000000000, name: 'Solana', logo: 'https://light.dangervalley.com/static/sol.png' };
const kTokenEth: IKToken = { symbol: 'ETH', decimals: 9, lamportsPerSol: 1000000000, name: 'ETH', logo: 'https://light.dangervalley.com/static/eth.png' };
const kTokenBnb: IKToken = { symbol: 'BNB', decimals: 9, lamportsPerSol: 1000000000, name: 'BNB', logo: 'https://light.dangervalley.com/static/bnb.svg' };

const kTokens: { [key: string]: IKToken } = {};
kTokens[Chain.SOLANA+':'+kSolAddress] = kTokenSol;
kTokens[Chain.SONIC+':'+kSolAddress] = kTokenSol;
kTokens[Chain.SONIC_TESTNET+':'+kSolAddress] = kTokenSol;
kTokens[Chain.SOON_MAINNET+':'+kSolAddress] = kTokenEth;
kTokens[Chain.SOON_TESTNET+':'+kSolAddress] = kTokenEth;
kTokens[Chain.SVMBNB_MAINNET+':'+kSolAddress] = kTokenBnb;
kTokens[Chain.SVMBNB_TESTNET+':'+kSolAddress] = kTokenBnb;
kTokens[Chain.SOONBASE_MAINNET+':'+kSolAddress] = kTokenEth;
kTokens[Chain.SOONBASE_TESTNET+':'+kSolAddress] = kTokenEth;

export function getNativeToken(chain: Chain): IKToken {
    const token = kTokens[chain+':'+kSolAddress];
    if (!token){
        return kTokenSol;
    }
    return token;
}