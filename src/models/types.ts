import { IUser } from "../entities/User";
import { IWallet } from "../entities/Wallet";
import { Token, TokenNft } from "../managers/TokenManager";

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
    explorerUrl: string,
    asset?: TokenNft,
    signature: string,
    blockTime: number,
    wallets: ChangedWallet[],
    tokens: Token[],
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
