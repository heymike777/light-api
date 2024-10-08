import { ExplorerManager } from "../services/explorers/ExplorerManager";
import { HeliusManager } from "../services/solana/HeliusManager";
import { JupiterManager } from "./JupiterManager";
import { MetaplexManager } from "./MetaplexManager";

export interface TokenNftAttribute {
    trait_type: string;
    value: string;
}

export interface TokenNft {
    id: string;
    image?: string;
    title?: string;
    uri?: string;
    attributes?: TokenNftAttribute[];
    marketplace: {title: string, url: string};
}

export interface Token {
    address: string;
    name?: string;
    symbol?: string;
    decimals?: number;
    // logo?: string;
    price?: number;
    priceUpdatedAt: number;

    nft?: TokenNft;
}

export const kDefaultTokens: Token[] = [
    {
        address: 'So11111111111111111111111111111111111111112',
        name: 'Wrapped SOL',
        symbol: 'WSOL',
        decimals: 9,
        // logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
        priceUpdatedAt: 0,
    },
    {
        address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
        name: 'Jupiter',
        symbol: 'JUP',
        decimals: 9,
        // logo: 'https://static.jup.ag/jup/icon.png',
        priceUpdatedAt: 0,
    },
    {
        address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: 6,
        // logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
        priceUpdatedAt: 0,
    },
    //TODO: add more tokens - USDT
];

export class TokenManager {

    static tokens: Token[] = kDefaultTokens;

    static async updateTokensPrices() {
        const tokens = TokenManager.tokens.sort((a, b) => a.priceUpdatedAt - b.priceUpdatedAt);
        const tokensToUpdate = tokens.slice(0, 100);
        const mints = tokensToUpdate.map(token => token.address);
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

    static async fetchDigitalAsset(address: string): Promise<Token> {
        const token: Token = {
            address,
            priceUpdatedAt: 0,
        }

        const digitalAssets = await MetaplexManager.fetchAllDigitalAssets([address]);
        // console.log('TokenManager', 'getToken', address, '=', digitalAssets);
        if (digitalAssets && digitalAssets.length > 0){
            const digitalAsset = digitalAssets[0];
            token.name = digitalAsset.metadata.name;
            token.symbol = digitalAsset.metadata.symbol;
            token.decimals = digitalAsset.mint.decimals;

            if (digitalAsset.mint.supply === BigInt(1)) {
                // NFT
                const nftId = digitalAsset.mint.publicKey.toString();
                token.nft = {
                    id: nftId,
                    title: digitalAsset.metadata.name,
                    uri: digitalAsset.metadata.uri,
                    marketplace: ExplorerManager.getMarketplace(nftId),
                };

                const uri = digitalAsset.metadata.uri;
                if (uri){
                    try {
                        const metadata = await fetch(uri);
                        const metadataJson = await metadata.json() as any;
                        // console.log('TokenManager', 'getToken', 'metadata', metadataJson);    

                        if (metadataJson.attributes){
                            token.nft.attributes = metadataJson.attributes;
                        }
                        if (metadataJson.image){
                            token.nft.image = metadataJson.image;
                        }                            
                    }
                    catch (error) {
                        // console.error('TokenManager', 'getToken', 'metadata', error);
                    }
                }
            }
            else {
                TokenManager.tokens.push(token);
            }
        }

        return token;
    }

    static async getToken(address: string): Promise<Token | undefined> {
        let token = TokenManager.tokens.find(token => token.address === address);
        if (!token){
            token = await this.fetchDigitalAsset(address);
        }
        if (token && !token.price){
            const prices = await JupiterManager.getPrices([address]);
            if (prices && prices.length > 0){
                token.price = prices[0].price;
                token.priceUpdatedAt = Date.now();
            }
            // console.log('TokenManager', 'getToken', 'prices', prices);
        }
        return token;
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


}