import * as mongoose from 'mongoose';
import { Chain, TimeBasedValue } from '../../services/solana/types';
import { BN } from 'bn.js';
import { TokenManager, TokenTag } from '../../managers/TokenManager';
import { kSolAddress, kUsdcAddress, kUsdtAddress } from '../../services/solana/Constants';

export let Schema = mongoose.Schema;
export let ObjectId = mongoose.Schema.Types.ObjectId;
export let Mixed = mongoose.Schema.Types.Mixed;

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

export interface ITokenModel {
    chain: Chain;

    address: string;
    decimals?: number;
    symbol?: string;
    name?: string;
    logo?: string;
    isVerified?: boolean;
    mintAuthority?: string;
    freezeAuthority?: string;
    description?: string;

    supply?: string;
    tags?: { [key: string]: boolean };
    tagsList?: TokenTag[];

    // properties
    price?: number;
    priceChange?: TimeBasedValue;
    marketCap?: number;
    volume?: TimeBasedValue;
    liquidity?: number;
    nft?: TokenNft;
    priceUpdatedAt?: number;
    infoUpdatedAt?: number;
}

export function tokenToTokenModel(token: IToken): ITokenModel {
    return {
        chain: token.chain,
        address: token.address,
        decimals: token.decimals,
        symbol: token.symbol,
        name: token.name,
        logo: token.logo,
        isVerified: token.isVerified,
        supply: token.supply,
        mintAuthority: token.mintAuthority,
        freezeAuthority: token.freezeAuthority,
        description: token.description,
        price: token.price,
        nft: token.nft,
        marketCap: TokenManager.calculateMarketCap(token),
        priceChange: token.priceChange,
        volume: token.volume,
        liquidity: token.liquidity,
        tags: token.tags,
        tagsList: TokenManager.tokenTagsToArray(token.tags),
    };
}

export interface IToken extends mongoose.Document, ITokenModel {
    updatedAt?: Date;
    createdAt?: Date;
}

export const TokenSchema = new mongoose.Schema<IToken>({
    chain: { type: String },
    address: { type: String },
    decimals: { type: Number },
    symbol: { type: String },
    name: { type: String },
    logo: { type: String },
    isVerified: { type: Boolean },
    mintAuthority: { type: String },
    freezeAuthority: { type: String },
    description: { type: String },

    supply: { type: mongoose.Schema.Types.Mixed },
    tags: { type: mongoose.Schema.Types.Mixed },

    updatedAt: { type: Date, default: new Date() },
    createdAt: { type: Date, default: new Date() }
});

TokenSchema.index({ chain: 1, address: 1 }, { unique: true });
TokenSchema.index({ symbol: 1 }, { unique: true });

TokenSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    return next();
});

TokenSchema.methods.toJSON = function () {
    return {
        chain: this.chain,
        address: this.address,
        decimals: this.decimals,
        symbol: this.symbol,
        name: this.name,
        logo: this.logo,
        isVerified: this.isVerified,
        supply: this.supply,
        mintAuthority: this.mintAuthority,
        freezeAuthority: this.freezeAuthority,
        description: this.description,
        isTradable: this.address !== kSolAddress && this.address !== kUsdcAddress && this.address !== kUsdtAddress,

        price: this.price,
        volume: this.volume,
        liquidity: this.liquidity,
        marketCap: TokenManager.calculateMarketCap(this as IToken),

        nft: this.nft,

        tags: this.tags,
        tagsList: TokenManager.tokenTagsToArray(this.tags),
    };
};

export const Token = mongoose.model<IToken>('tokens', TokenSchema);