import * as mongoose from 'mongoose';
import { Chain } from '../../services/solana/types';

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

export interface IToken extends mongoose.Document {
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

    updatedAt?: Date;
    createdAt?: Date;

    // properties
    price?: number;
    volume?: {
        '5m': number;
        '1h': number;
        '6h': number;
        '24h': number;
    };
    liquidity?: number;
    marketCap?: number;
    nft?: TokenNft;
    priceUpdatedAt?: number;
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

    updatedAt: { type: Date, default: new Date() },
    createdAt: { type: Date, default: new Date() }
});

TokenSchema.index({ chain: 1, address: 1 }, { unique: true });

TokenSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    return next();
});

TokenSchema.methods.toJSON = function () {
    return {
        id: this._id,
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

        price: this.price,
        volume: this.volume,
        liquidity: this.liquidity,
        marketCap: this.marketCap,

        nft: this.nft,

    };
};

export const Token = mongoose.model<IToken>('tokens', TokenSchema);