import * as umi from "@metaplex-foundation/umi";
import { IToken, ITokenModel, Token, tokenToTokenModel } from "../entities/tokens/Token";
import { TokenSwap } from "../entities/tokens/TokenSwap";
import { ExplorerManager } from "../services/explorers/ExplorerManager";
import { Chain } from "../services/solana/types";
import { JupiterManager } from "./JupiterManager";
import { MetaplexManager } from "./MetaplexManager";
import { kSolAddress, kUsdcAddress, kUsdtAddress } from "../services/solana/Constants";
import { BN } from "bn.js";
import { SolScanManager } from "../services/solana/SolScanManager";
import { newConnectionByChain } from "../services/solana/lib/solana";
import { ITokenPair, TokenPair } from "../entities/tokens/TokenPair";
import { SolanaManager } from "../services/solana/SolanaManager";
import * as web3 from "@solana/web3.js";
import { LogManager } from "./LogManager";
import { RedisManager } from "./db/RedisManager";
import { LpMint } from "../entities/tokens/LpMint";
import { SwapDex } from "../entities/payments/Swap";
import * as spl from "@solana/spl-token";
import { RaydiumManager } from "../services/solana/RaydiumManager";
import { MicroserviceManager } from "./MicroserviceManager";

export interface TokenTag {
    id: string;
    title: string;
    color: string;
}

export class TokenManager {

    static solPrice: number = 0;
    static tokenTags: TokenTag[] = [
        { id: 'verified', title: 'Verified', color: '#28A745' },
        { id: 'stable', title: 'Stable', color: '#2775CA' },
        { id: 'new', title: 'New', color: '#138808' },
        { id: 'trending', title: 'Trending', color: '#7C0902' },
        { id: 'pumpfun', title: 'pump.fun', color: '#86EFAC' },
        { id: 'virtuals', title: 'Virtuals', color: '#57A0A4' },
    ];

    static manualTokens: { [key: string]: { symbol?: string } } = {
        'sol:bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1': { symbol: 'bSOL' },
    }

    static excludedTokens: string[] = [
        kSolAddress,
        kUsdcAddress,
        kUsdtAddress,
    ];

    static async fetchDigitalAsset(chain: Chain, address: string): Promise<IToken> {
        const token = new Token();
        token.chain = chain;
        token.address = address;
        token.priceUpdatedAt = 0;
        token.isVerified = false;

        const digitalAssets = await MetaplexManager.fetchAllDigitalAssets(chain, [address]);
        LogManager.log('TokenManager', 'getToken', address, '=', digitalAssets);
        if (digitalAssets && digitalAssets.length > 0){
            const digitalAsset = digitalAssets[0];

            const uri = digitalAsset.metadata.uri;
            let metadata: any = undefined;
            if (uri){
                try {
                    const metadataData = await fetch(uri);
                    metadata = await metadataData.json() as any;                       
                }
                catch (error) {
                    // LogManager.error('TokenManager', 'getToken', 'metadata', error);
                }
            }

            token.name = digitalAsset.metadata.name;
            token.symbol = digitalAsset.metadata.symbol;
            if (!token.symbol){
                const key = `${token.chain}:${token.address}`;
                if (TokenManager.manualTokens[key] && TokenManager.manualTokens[key].symbol){
                    token.symbol = TokenManager.manualTokens[key].symbol;
                }
            }

            token.decimals = digitalAsset.mint.decimals;
            token.supply = digitalAsset.mint.supply.toString();
            
            const mintAuthority = umi.unwrapOption(digitalAsset.mint.mintAuthority) || undefined;
            token.mintAuthority = mintAuthority ? mintAuthority.toString() : undefined;
            const freezeAuthority = umi.unwrapOption(digitalAsset.mint.freezeAuthority) || undefined;
            token.freezeAuthority = freezeAuthority ? freezeAuthority.toString() : undefined;

            token.logo = metadata?.image || metadata?.logo || undefined;
            token.description = metadata?.description || undefined;

            LogManager.log('!digitalAsset:', digitalAsset, 'metadata:', metadata);

            if (digitalAsset.mint.supply === BigInt(1)) {
                // NFT
                const nftId = digitalAsset.mint.publicKey.toString();
                token.nft = {
                    id: nftId,
                    title: digitalAsset.metadata.name,
                    uri: digitalAsset.metadata.uri,
                    marketplace: ExplorerManager.getMarketplace(nftId),
                };

                if (metadata?.attributes){
                    token.nft.attributes = metadata.attributes;
                }
                if (metadata?.image){
                    token.nft.image = metadata.image;
                }     
            }
            else {
                try{
                    await RedisManager.saveToken(token);
                }
                catch (error){
                    LogManager.error('!catched', 'TokenManager', 'RedisManager', 'saveToken', error);
                }                

                try{
                    await token.save();
                }
                catch (error){
                    LogManager.error('!catched', 'TokenManager', 'fetchDigitalAsset', 'save', error);
                }
            }
        }

        return token;
    }

    static async getToken(chain: Chain, address: string): Promise<ITokenModel | undefined> {
        const tokens = await this.getTokens(chain, [address]);
        if (!tokens || tokens.length == 0){
            return undefined;
        }
        return tokens[0];
        // let token = await RedisManager.getToken(chain, address);
        // if (!token){
        //     token = await this.fetchDigitalAsset(chain, address);
        // }

        // LogManager.log('TokenManager', 'getToken1', 'address:', address, 'token:', token);
        // if (token){
        //     if (!token.price || !token.priceUpdatedAt || (Date.now() - token.priceUpdatedAt) > 1000 * 60){
        //         const prices = await JupiterManager.getPrices([address]);
        //         if (prices && prices.length > 0){
        //             token.price = prices[0].price;
        //             token.priceUpdatedAt = Date.now();
        //         }
        //         LogManager.log('TokenManager', 'getToken', 'JUP prices', prices);
        //     }

        //     if (token.price!=undefined && token.supply!=undefined && token.decimals!=undefined){
        //         token.marketCap = TokenManager.calculateMarketCap(token);

        //         if (!this.excludedTokens.includes(token.address) && !token.nft){
        //             token.liquidity = await this.getUsdLiquidityForToken(token);
        //         }
        //     }

        //     await RedisManager.saveToken(token);
        // }
        // LogManager.log('TokenManager', 'getToken2', 'address:', address, 'token:', token);

        // return tokenToTokenModel(token);
    }

    static async getTokens(chain: Chain, mints: string[]): Promise<ITokenModel[]> {
        const tokens = await RedisManager.getTokens(chain, mints);

        const remainingMints = mints.filter(mint => !tokens.find(token => token.address === mint));
        if (remainingMints.length > 0){
            for (const mint of remainingMints) {
                const token = await this.fetchDigitalAsset(chain, mint);
                if (token){
                    tokens.push(token);
                }
            }
        }

        for (const token of tokens) {
            if (!token.price || !token.priceUpdatedAt || (Date.now() - token.priceUpdatedAt) > 1000 * 60){
                // const prices = await JupiterManager.getPrices([token.address]);
                const prices = await MicroserviceManager.getTokensPrices(chain, [token.address]);
                if (prices && prices.length > 0){
                    token.price = prices[0].price;
                    token.priceUpdatedAt = Date.now();
                }
                LogManager.log('TokenManager', 'getToken', 'JUP prices', prices);
            }

            if (token.price!=undefined && token.supply!=undefined && token.decimals!=undefined){
                token.marketCap = TokenManager.calculateMarketCap(token);

                if (!this.excludedTokens.includes(token.address) && !token.nft){
                    token.liquidity = await this.getUsdLiquidityForToken(token);
                }
            }

            await RedisManager.saveToken(token);
        }


        return tokens.map(token => tokenToTokenModel(token));
    }

    static async getTokensByPair(chain: Chain, pairAddress: string): Promise<ITokenModel[]> {
        const tokens: ITokenModel[] = [];

        const pair = await TokenPair.findOne({ chain, pairAddress });
        if (pair){
            if (pair.token1 != kSolAddress && pair.token1 != kUsdcAddress && pair.token1 != kUsdtAddress){
                const token = await this.getToken(pair.chain, pair.token1);
                if (token){
                    tokens.push(token);
                }
            }

            if (pair.token2 != kSolAddress && pair.token2 != kUsdcAddress && pair.token2 != kUsdtAddress){
                const token = await this.getToken(pair.chain, pair.token2);
                if (token){
                    tokens.push(token);
                }
            }
        }

        if (tokens.length === 0){
            //TODO: fetch pair onchain
        }

        return tokens;
    }

    static async getUsdLiquidityForToken(token: IToken): Promise<number> {
        if (!token.price || token.price==0){
            return 0;
        }

        let pairs = await TokenManager.getAllTokenPairs(token.chain, token.address);
        if (!pairs || pairs.length === 0){
            pairs = await TokenManager.fetchTokenPairs(token.chain, token.address);
        }
        let liquidity = { sol: 0, token: 0 };
        for (const pair of pairs){
            if (pair.liquidity){
                const pairLpSol = pair.token1 === kSolAddress ? pair.liquidity.token1.uiAmount : pair.liquidity.token2.uiAmount;
                const pairLpToken = pair.token1 === token.address ? pair.liquidity.token1.uiAmount : pair.liquidity.token2.uiAmount;


                if (pairLpSol!=undefined && pairLpToken!=undefined){
                    liquidity.sol += pairLpSol;
                    liquidity.token += pairLpToken;
                }
                else {
                    LogManager.log('!catched weird behaviour', 'TokenManager', 'LIQ', 'pair', pair.pairAddress, 'pair.liquidity', pair.liquidity);
                }

            }
        }

        return Math.round(liquidity.sol * this.getSolPrice() + liquidity.token * token.price);
    }

    // static async fetchTokensInfo(){
    //     let tokens = TokenManager.cachedTokens.filter(token => !token.symbol);
    //     if (tokens.length > 0){
    //         tokens = tokens.splice(0, 10);
    //         const mints = tokens.map(token => token.address);
    //         const digitalAssets = await MetaplexManager.fetchAllDigitalAssets(mints);
    //         for (const digitalAsset of digitalAssets){
    //             const token = TokenManager.cachedTokens.find(token => token.address === digitalAsset.publicKey.toString());
    //             if (token){
    //                 token.name = digitalAsset.metadata.name;
    //                 token.symbol = digitalAsset.metadata.symbol;
    //                 token.decimals = digitalAsset.mint.decimals;
    //             }
    //         }
    //     }
    // }

    static async clearOldSwaps(){
        // delete swaps older than 1 day
        const now = new Date();
        const yesterday = new Date();
        yesterday.setDate(now.getDate() - 1);
        await TokenSwap.deleteMany({ createdAt: { $lt: yesterday } });
    }

    static getSolPrice(): number {
        return this.solPrice;
    }

    static calculateMarketCap(token: IToken): number | undefined {
        if (token.supply && token.price && token.decimals){
            const bigNumber = 10 ** 10;
            return new BN(token.supply).mul(new BN(token.price * bigNumber)).div(new BN(bigNumber)).div(new BN(10).pow(new BN(token.decimals))).toNumber();
        }
        return undefined;
    }

    static async fetchTokenPairs(chain: Chain, mint: string): Promise<ITokenPair[]> {
        const markets = await SolScanManager.fetchTokenMarkets(mint);
        if (!markets || markets.length === 0){
            return [];
        }

        const poolIds = markets.map((market) => market.poolId);
        const pairs = await TokenPair.find({ chain, pairAddress: { $in: poolIds } });
        const tokenPairs: ITokenPair[] = [];
        for (const market of markets) {
            let pair: ITokenPair | undefined = pairs.find((pair) => pair.pairAddress === market.poolId);

            if (!pair){
                pair = await this.createTokenPair(chain, market.poolId, market.token1, market.token2, market.tokenAccount1, market.tokenAccount2, market.programId);
            }

            if (!pair){
                continue;
            }

            await this.updateTokenPairLiquidity(pair);

            tokenPairs.push(pair);
        }

        return tokenPairs;
    }

    static async createTokenPair(chain: Chain, pairAddress: string, token1: string, token2: string, tokenAccount1: string | undefined, tokenAccount2: string | undefined, programId: string | undefined, lpMint?: string): Promise<ITokenPair | undefined> {
        const connection = newConnectionByChain(chain);
        const info = await connection.getParsedAccountInfo(new web3.PublicKey(pairAddress));
        console.log('info:', JSON.stringify(info));

        const existing = await TokenPair.findOne({ chain, pairAddress });
        if (existing){
            return existing;
        }

        if (!tokenAccount1 || !tokenAccount2){
            const poolInfo: any = await RaydiumManager.getAmmPoolInfo(Chain.SOLANA, pairAddress);
            if (poolInfo){
                tokenAccount1 = token1 == poolInfo.baseMint ? poolInfo.baseVault : poolInfo.quoteVault
                tokenAccount2 = token2 == poolInfo.baseMint ? poolInfo.baseVault : poolInfo.quoteVault
            }
        }

        try {
            const pair = new TokenPair();
            pair.chain = chain;
            pair.pairAddress = pairAddress;
            pair.token1 = token1;
            pair.token2 = token2;
            pair.tokenAccount1 = tokenAccount1;
            pair.tokenAccount2 = tokenAccount2;
            pair.lpMint = lpMint;
            pair.programId = programId;
            pair.createdAt = new Date();
            await pair.save();
            
            // await this.updateTokenPairLiquidity(pair);

            return pair;
        }
        catch (error){
            LogManager.error('!catched', 'TokenManager', 'createTokenPair', error);
        }
        return undefined;
    }

    static async updateTokenPairLiquidity(pair: ITokenPair) {
        if (!pair.tokenAccount1 || !pair.tokenAccount2){
            return;
        }
        try {
            const connection = newConnectionByChain(pair.chain);

            const accounts: any = await connection.getMultipleParsedAccounts([
                new web3.PublicKey(pair.tokenAccount1),
                new web3.PublicKey(pair.tokenAccount2),
            ]);

            const value1 = accounts.value.find((account: any) => account?.data?.parsed?.info?.mint == pair.token1);
            const tokenBalance1: web3.TokenAmount | undefined = value1?.data?.parsed?.info?.tokenAmount;  
            const value2 = accounts.value.find((account: any) => account?.data?.parsed?.info?.mint == pair.token2);
            const tokenBalance2: web3.TokenAmount | undefined = value2?.data?.parsed?.info?.tokenAmount;  

            // const tokenBalance1 = await SolanaManager.getTokenAccountBalance(connection, new web3.PublicKey(pair.tokenAccount1));
            // const tokenBalance2 = await SolanaManager.getTokenAccountBalance(connection, new web3.PublicKey(pair.tokenAccount2));

            if (tokenBalance1?.uiAmount && tokenBalance1?.uiAmount>0 && tokenBalance2?.uiAmount && tokenBalance2?.uiAmount>0){
                pair.liquidity = {
                    token1: {
                        amount: tokenBalance1.amount,
                        uiAmount: tokenBalance1.uiAmount,
                        decimals: tokenBalance1.decimals,
                    },
                    token2: {
                        amount: tokenBalance2.amount,
                        uiAmount: tokenBalance2.uiAmount,
                        decimals: tokenBalance2.decimals,
                    },
                };
            }

            pair.updatedAt = new Date();
            await pair.save();
        }
        catch (error){
            LogManager.error('!catched', 'TokenManager', 'updateTokenPairLiquidity', error);
        }
    }

    static async updateTokenPairsLiquidity() {
        const pairs = await TokenPair.find({ chain: Chain.SOLANA }).sort({ updatedAt: 1 }).limit(100);
        if (!pairs || pairs.length === 0){
            return;
        }

        for (const pair of pairs) {
            await this.updateTokenPairLiquidity(pair);
        }
    }

    static async getAllTokenPairs(chain: Chain, mint: string): Promise<ITokenPair[]> {
        //TODO: can get it from RAM
        const pairs = await TokenPair.find({ chain, $or: [{ token1: mint }, { token2: mint }] });
        return pairs;
    }

    static async fillTokenModelsWithData(tokens: ITokenModel[]): Promise<ITokenModel[]> {
        const tokensByChains: { [key: string]: ITokenModel[] } = {};
        for (const token of tokens){
            if (!tokensByChains[token.chain]){  
                tokensByChains[token.chain] = [];
            }
            tokensByChains[token.chain].push(token);
        }

        for (const chain in tokensByChains){
            const chainTokens = tokensByChains[chain];
            const chainMints = chainTokens.map(token => token.address);
            const cachedTokens = await RedisManager.getTokens(chain as Chain, chainMints);

            for (const token of tokens){
                const freshToken = cachedTokens.find(cachedToken => chain == token.chain &&  cachedToken.address === token.address);
                if (freshToken){
                    token.isVerified = freshToken.isVerified;
                }
            }
        }

        return tokens;
    }

    static async updateTokenPrice(chain: Chain, mint: string) {
        const token = await RedisManager.getToken(chain, mint);

        console.log('updateTokenPrice', mint);


        if (token){
            // const prices = await JupiterManager.getPrices([mint]);
            const prices = await MicroserviceManager.getTokensPrices(chain, [mint]);
            if (prices && prices.length > 0){
                token.price = prices[0].price;
                console.log('updateTokenPrice', mint, 'newPrice:', token.price);
                token.priceUpdatedAt = Date.now();
            } 
            await RedisManager.saveToken(token);   
        }
    }

    static async fetchSolPriceFromRedis(){
        const price = await RedisManager.getToken(Chain.SOLANA, kSolAddress);
        console.log('fetchSolPriceFromRedis price:', price?.price);
        if (price && price.price!=undefined){
            TokenManager.solPrice = price.price;
        }
    }

    static tokenTagsToArray(tagsMap?: { [key: string]: boolean }): TokenTag[] {
        if (!tagsMap){
            return [];
        }
        return this.tokenTags.filter(tag => tagsMap[tag.id]);
    }

    static async setTokenTags(chain: Chain, mint: string, tagsIds: string[], deleteOtherTags = false) {
        // set in mongo
        const token = await Token.findOne({ address: mint });
        if (token){
            const tags = deleteOtherTags ? {} : token.tags || {};
            for (const tagId of tagsIds){
                tags[tagId] = true;
            }
            token.tags = tags;
            await token.save();
        }

        // set in redis
        const tokenFromRedis = await RedisManager.getToken(chain, mint);
        if (tokenFromRedis){
            const tags = deleteOtherTags ? {} : tokenFromRedis.tags || {};
            for (const tagId of tagsIds){
                tags[tagId] = true;
            }
            tokenFromRedis.tags = tags;
            await RedisManager.saveToken(tokenFromRedis);
        }
    }

    static isTokenTradable(mint?: string): boolean {
        if (!mint){
            return false;
        }
        
        return mint !== kSolAddress && mint !== kUsdcAddress && mint !== kUsdtAddress;
    }
    
    static async findTokenByLpMint(chain: Chain, lpMintAddress: string): Promise<(ITokenModel & {lpMint: string}) | undefined> {
        const results = await this.findTokensByLpMints(chain, [lpMintAddress]);
        return (results && results.length > 0) ? results[0] : undefined;
    }

    static async findTokensByLpMints(chain: Chain, lpMintAddresses: string[]): Promise<(ITokenModel & {lpMint: string})[]> {
        const lpMints = await LpMint.find({ chain, lpMint: { $in: lpMintAddresses } });
        if (!lpMints || lpMints.length === 0){
            return [];
        }

        const tokenAddresses = lpMints.map(lpMint => lpMint.token1 == kSolAddress ? lpMint.token2 : lpMint.token1);
        console.log('!!!mike', 'tokenAddresses', tokenAddresses);
        const tokens = await this.getTokens(chain, tokenAddresses);
        const results: (ITokenModel & {lpMint: string})[] = [];
        for (const token of tokens) {
            const lpMint = lpMints.find(lpMint => lpMint.token1 == token.address || lpMint.token2 == token.address);
            console.log('!!!mike', token.address, token.symbol, lpMint);
            if (lpMint){
                results.push({ ...token, lpMint: lpMint.lpMint });
            }
            else {
                LogManager.error('!catched', 'TokenManager', 'findTokensByLpMints', 'lpMint not found', token.address);
            }
        }
        return results;
    }

    static async saveLpMint(chain: Chain, dex: SwapDex, lpMintAddress: string, pairAddress: string, token1: string, token2: string) {
        try {
            const existing = await LpMint.findOne({ lpMint: lpMintAddress });
            if (existing){
                return;
            }

            const lpMint = new LpMint();
            lpMint.chain = chain;
            lpMint.dex = dex;
            lpMint.lpMint = lpMintAddress;
            lpMint.pairAddress = pairAddress;
            lpMint.token1 = token1;
            lpMint.token2 = token2;
            lpMint.createdAt = new Date();
            await lpMint.save();    
        }
        catch (error){
            LogManager.error('!catched', 'TokenManager', 'saveLpMint', error);
        }
    }
}