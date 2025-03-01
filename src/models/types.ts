import { IToken, ITokenModel, TokenNft } from "../entities/tokens/Token";
import { IUser } from "../entities/users/User";
import { IWallet } from "../entities/Wallet";
import { TokenTag } from "../managers/TokenManager";
import { Asset } from "../services/solana/SolanaManager";

export enum Environment {
    PRODUCTION = 'PRODUCTION',
    DEVELOPMENT = 'DEVELOPMENT'
}

export interface ChatWallets {
    user: IUser;
    wallets: IWallet[];
}

export interface TransactionApiResponse {
    title: string,
    description?: string,
    explorerUrl?: string,
    asset?: TokenNft,
    signature?: string,
    blockTime?: number,
    wallets?: ChangedWallet[],
    tokens?: ITokenModel[],
}

export interface ChangedWallet {
    walletAddress: string,
    title: string,
    explorerUrl: string,
    tokenChanges: ChangedWalletTokenChange[],
}

export interface ChangedWalletTokenChange {
    mint: string,
    symbol: string,
    description: string,
}

export enum AppPlatform {
    IOS = 'ios',
    ANDROID = 'android',
    UNKNOWN = 'unknown',
}

export type PortfolioAsset = Asset & {
    isVerified?: boolean;
    pnl?: number;
    tags?: { [key: string]: boolean };
    tagsList?: TokenTag[];
    isTradable?: boolean;
}