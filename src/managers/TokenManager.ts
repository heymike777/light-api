import * as umi from "@metaplex-foundation/umi";
import { IToken, ITokenModel, Token, tokenToTokenModel } from "../entities/tokens/Token";
import { TokenSwap } from "../entities/tokens/TokenSwap";
import { ExplorerManager } from "../services/explorers/ExplorerManager";
import { HeliusManager } from "../services/solana/HeliusManager";
import { Chain } from "../services/solana/types";
import { JupiterManager } from "./JupiterManager";
import { MetaplexManager } from "./MetaplexManager";
import { kSolAddress } from "../services/solana/Constants";
import { BN } from "bn.js";
import { SolScanManager } from "../services/solana/SolScanManager";
import { newConnection } from "../services/solana/lib/solana";
import { ITokenPair, TokenPair } from "../entities/tokens/TokenPair";
import { SolanaManager } from "../services/solana/SolanaManager";
import * as web3 from "@solana/web3.js";
import { Helpers } from "../services/helpers/Helpers";

// export const kDefaultTokens: Token[] = [
//     {
//         address: 'So11111111111111111111111111111111111111112',
//         name: 'Wrapped SOL',
//         symbol: 'WSOL',
//         decimals: 9,
//         // logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
//         priceUpdatedAt: 0,
//     },
//     {
//         address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
//         name: 'Jupiter',
//         symbol: 'JUP',
//         decimals: 9,
//         // logo: 'https://static.jup.ag/jup/icon.png',
//         priceUpdatedAt: 0,
//     },
//     {
//         address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
//         name: 'USD Coin',
//         symbol: 'USDC',
//         decimals: 6,
//         // logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
//         priceUpdatedAt: 0,
//     },
//     //TODO: add more tokens - USDT
// ];

export class TokenManager {

    static tokens: IToken[] = [];

    static async init(){
        TokenManager.tokens = await Token.find();
        console.log('TokenManager', 'init', 'tokens.length =', TokenManager.tokens.length);
    }

    static async updateTokensPrices() {
        const tokens = TokenManager.tokens.sort((a, b) => (a.priceUpdatedAt || 0) - (b.priceUpdatedAt || 0));
        const tokensToUpdate = tokens.slice(0, 99);
        const mints = tokensToUpdate.map(token => token.address);
        mints.push(kSolAddress);
        const prices = await JupiterManager.getPrices(mints);
        const now = Date.now();
        for (const price of prices) {
            const token = TokenManager.tokens.find(token => token.address === price.address);
            if (token){
                token.price = price.price;
                token.priceUpdatedAt = now;
            }
        }
    }

    static async fetchDigitalAsset(address: string): Promise<IToken> {
        let token = TokenManager.tokens.find(token => token.address === address);

        if (!token){
            token = new Token();
            token.chain = Chain.SOLANA;
            token.address = address;
            token.priceUpdatedAt = 0;
            token.isVerified = false;
        }

        const digitalAssets = await MetaplexManager.fetchAllDigitalAssets([address]);
        // console.log('TokenManager', 'getToken', address, '=', digitalAssets);
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
                    // console.error('TokenManager', 'getToken', 'metadata', error);
                }
            }

            token.name = digitalAsset.metadata.name;
            token.symbol = digitalAsset.metadata.symbol;
            token.decimals = digitalAsset.mint.decimals;
            token.supply = digitalAsset.mint.supply.toString();
            
            const mintAuthority = umi.unwrapOption(digitalAsset.mint.mintAuthority) || undefined;
            token.mintAuthority = mintAuthority ? mintAuthority.toString() : undefined;
            const freezeAuthority = umi.unwrapOption(digitalAsset.mint.freezeAuthority) || undefined;
            token.freezeAuthority = freezeAuthority ? freezeAuthority.toString() : undefined;

            token.logo = metadata?.image || metadata?.logo || undefined;
            token.description = metadata?.description || undefined;

            console.log('!digitalAsset:', digitalAsset, 'metadata:', metadata);

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
                TokenManager.tokens.push(token);
                try{
                    await token.save();
                }
                catch (error){
                    console.error('!catched', 'TokenManager', 'fetchDigitalAsset', 'save', error);
                }
            }
        }

        return token;
    }

    static async getToken(address: string): Promise<ITokenModel | undefined> {
        let token = TokenManager.tokens.find(token => token.address === address);
        if (!token){
            token = await this.fetchDigitalAsset(address);
        }
        if (token){
            if (!token.infoUpdatedAt || Date.now() - token.infoUpdatedAt > 1000 * 60 * 5){
                const info = await SolScanManager.fetchTokenInfo(address);
                if (info){
                    let isInfoUpdated = false;
                    if (info.supply != undefined){
                        token.supply = info.supply;
                        isInfoUpdated = true;
                    }
                    if (info.price != undefined){
                        token.price = info.price;
                        isInfoUpdated = true;
                        token.priceUpdatedAt = Date.now();
                    }
                    if (info.volume != undefined && info.volume['24h'] != undefined){
                        token.volume = info.volume;
                        isInfoUpdated = true;
                    }
                    if (info.priceChange != undefined && info.priceChange['24h'] != undefined){
                        token.priceChange = info.priceChange;
                        isInfoUpdated = true;
                    }

                    token.mintAuthority = info.mintAuthority;
                    token.freezeAuthority = info.freezeAuthority;

                    if (isInfoUpdated){
                        token.infoUpdatedAt = Date.now();
                    }
                }
            }
            if (!token.price){
                const prices = await JupiterManager.getPrices([address]);
                if (prices && prices.length > 0){
                    token.price = prices[0].price;
                    token.priceUpdatedAt = Date.now();
                }
                // console.log('TokenManager', 'getToken', 'prices', prices);
            }

            if (token.price!=undefined && token.supply!=undefined && token.decimals!=undefined){
                token.marketCap = TokenManager.calculateMarketCap(token);

                if (token.address !== kSolAddress){
                    token.liquidity = await this.getUsdLiquidityForToken(token);
                }
            }

            console.log('!mike', 'TokenManager', 'getToken', 'token', token);
        }
        return tokenToTokenModel(token);
    }

    static async getUsdLiquidityForToken(token: IToken): Promise<number> {
        if (!token.price || token.price==0){
            return 0;
        }

        let pairs = await TokenManager.getAllTokenPairs(token.address);
        if (!pairs || pairs.length === 0){
            pairs = await TokenManager.fetchTokenPairs(token.address);
        }
        let liquidity = { sol: 0, token: 0 };
        for (const pair of pairs){
            if (pair.liquidity){
                // console.log('!mike', 'TokenManager', 'LIQ', 'pair', pair.pairAddress, 'pair.token1:', pair.token1, 'pair.token2:', pair.token2);
                const pairLpSol = pair.token1 === kSolAddress ? pair.liquidity.token1.uiAmount : pair.liquidity.token2.uiAmount;
                const pairLpToken = pair.token1 === token.address ? pair.liquidity.token1.uiAmount : pair.liquidity.token2.uiAmount;

                liquidity.sol += pairLpSol;
                liquidity.token += pairLpToken;

                // console.log('!mike', 'TokenManager', 'LIQ', 'pair', pair.pairAddress, 'pairLpSol:', pairLpSol, 'pairLpToken:', pairLpToken);
            }
        }

        return Math.round(liquidity.sol * this.getSolPrice() + liquidity.token * token.price);
    }

    static async fetchTokensInfo(){
        let tokens = TokenManager.tokens.filter(token => !token.symbol);
        if (tokens.length > 0){
            tokens = tokens.splice(0, 10);
            const mints = tokens.map(token => token.address);
            const digitalAssets = await MetaplexManager.fetchAllDigitalAssets(mints);
            for (const digitalAsset of digitalAssets){
                const token = TokenManager.tokens.find(token => token.address === digitalAsset.publicKey.toString());
                if (token){
                    token.name = digitalAsset.metadata.name;
                    token.symbol = digitalAsset.metadata.symbol;
                    token.decimals = digitalAsset.mint.decimals;
                }
            }
        }
    }

    static async clearOldSwaps(){
        // delete swaps older than 1 day
        const now = new Date();
        const yesterday = new Date();
        yesterday.setDate(now.getDate() - 1);
        await TokenSwap.deleteMany({ createdAt: { $lt: yesterday } });
    }

    static getSolPrice(): number {
        const token = TokenManager.tokens.find(token => token.address === kSolAddress);
        return token?.price || 0;
    }

    static calculateMarketCap(token: IToken): number | undefined {
        if (token.supply && token.price && token.decimals){
            const bigNumber = 10 ** 10;
            return new BN(token.supply).mul(new BN(token.price * bigNumber)).div(new BN(bigNumber)).div(new BN(10).pow(new BN(token.decimals))).toNumber();
        }
        return undefined;
    }

    static async fetchTokenPairs(mint: string): Promise<ITokenPair[]> {
        const markets = await SolScanManager.fetchTokenMarkets(mint);
        if (!markets || markets.length === 0){
            return [];
        }

        const poolIds = markets.map((market) => market.poolId);
        const pairs = await TokenPair.find({ pairAddress: { $in: poolIds } });
        const tokenPairs: ITokenPair[] = [];
        for (const market of markets) {
            let pair: ITokenPair | undefined = pairs.find((pair) => pair.pairAddress === market.poolId);

            if (!pair){
                pair = new TokenPair();
                pair.chain = Chain.SOLANA;
                pair.pairAddress = market.poolId;
                pair.token1 = market.token1;
                pair.token2 = market.token2;
                pair.tokenAccount1 = market.tokenAccount1;
                pair.tokenAccount2 = market.tokenAccount2;
                pair.programId = market.programId;
                pair.createdAt = new Date();
            }

            await this.updateTokenPairLiquidity(pair);

            tokenPairs.push(pair);
            try {
                pair.save();
            }
            catch (error){
                console.error('!catched', 'TokenManager', 'fetchTokenPairs', 'save', error);
            }
        }

        return tokenPairs;
    }

    static async fetchNewPoolsForExistingTokens() {
        const pairs = await TokenPair.find({});
        const uniqueMints = new Set<string>();
        for (const pair of pairs){
            uniqueMints.add(pair.token1);
            uniqueMints.add(pair.token2);
        }

        for (const mint of uniqueMints){
            if (mint != kSolAddress){
                await this.fetchTokenPairs(mint);
                await Helpers.sleep(0.05);
            }
        }
    }

    static async updateTokenPairLiquidity(pair: ITokenPair) {
        const connection = newConnection();
        const tokenBalance1 = await SolanaManager.getTokenAccountBalance(connection, new web3.PublicKey(pair.tokenAccount1));
        const tokenBalance2 = await SolanaManager.getTokenAccountBalance(connection, new web3.PublicKey(pair.tokenAccount2));

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
    }

    static async updateTokenPairsLiquidity() {
        const pairs = await TokenPair.find({}).sort({ updatedAt: 1 }).limit(100);
        if (!pairs || pairs.length === 0){
            return;
        }

        for (const pair of pairs) {
            await this.updateTokenPairLiquidity(pair);
            await pair.save();
        }
    }

    static async getAllTokenPairs(mint: string): Promise<ITokenPair[]> {
        //TODO: can get it from RAM
        const pairs = await TokenPair.find({ $or: [{ token1: mint }, { token2: mint }] });
        return pairs;
    }


}