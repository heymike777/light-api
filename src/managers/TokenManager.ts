import * as umi from "@metaplex-foundation/umi";
import { IToken, Token } from "../entities/tokens/Token";
import { TokenSwap } from "../entities/tokens/TokenSwap";
import { ExplorerManager } from "../services/explorers/ExplorerManager";
import { HeliusManager } from "../services/solana/HeliusManager";
import { Chain } from "../services/solana/types";
import { JupiterManager } from "./JupiterManager";
import { MetaplexManager } from "./MetaplexManager";

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

    static async fetchDigitalAsset(address: string): Promise<IToken> {
        const token: IToken = new Token();
        token.chain = Chain.SOLANA;
        token.address = address;
        token.priceUpdatedAt = 0;

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
            token.isVerified = false;
            token.mintAuthority = umi.unwrapOption(digitalAsset.mint.mintAuthority) || undefined
            token.freezeAuthority = umi.unwrapOption(digitalAsset.mint.freezeAuthority) || undefined;
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

    static async getToken(address: string): Promise<IToken | undefined> {
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

    static async clearOldSwaps(){
        // delete swaps older than 1 day
        const now = new Date();
        const yesterday = new Date();
        yesterday.setDate(now.getDate() - 1);
        await TokenSwap.deleteMany({ createdAt: { $lt: yesterday } });
    }


}