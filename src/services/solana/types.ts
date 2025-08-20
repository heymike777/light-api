import { SubscriptionTier } from "../../entities/payments/Subscription";

export interface TransactionStatus {
  status: Status;
  signature?: string;
  blockhash?: string;
  triesCount?: number;
  createdAt?: Date;
}

export enum Status {
  CREATED = 'CREATED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export interface TransactionStatusResponse {
  id: string;
  signature?: string;
  status?: Status;
}

export enum Environment {
  PRODUCTION = 'PRODUCTION',
  DEVELOPMENT = 'DEVELOPMENT'
}

export interface WalletModel {
  publicKey: string; 
  privateKey: string;
}

export interface EncryptedWalletModel {
    publicKey: string; 
    data: string;
    iv: string;
    tag: string;
}

export enum AssetType {
  pNFT = 'pNFT',
  NFT = 'NFT',
  cNFT = 'cNFT',
  SOL = 'SOL',
  SPL = 'SPL',
  UNKNOWN = 'UNKNOWN'
}

export interface Asset {
    id: string;
    type: AssetType;
    title: string;
    image?: string;
    isDelegated?: boolean;
    collection?: {
        id: string,
        title?: string,
    };
    tags?: string[];
    infoline?: string;
    isStaked?: boolean;
    creators?: {
        address: string;
        share: number;
        verified: boolean;
    }[];
}

export interface Amount {
    amount: string;
    uiAmount: number;
    decimals: number;
}

export enum Priority {
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
    ULTRA = 'ultra',
}

export enum Chain {
    SOLANA = 'sol',
    SONIC = 'sonic', // Sonic SVM mainnet
    SONIC_TESTNET = 't_sonic',
    SOON_MAINNET = 'soon',
    SOON_TESTNET = 't_soon',
    SVMBNB_MAINNET = 'svmbnb',
    SVMBNB_TESTNET = 't_svmbnb',
    SOONBASE_MAINNET = 'soonba',
    SOONBASE_TESTNET = 't_soonbase',
}

export const kAllChains = Object.values(Chain) as Chain[];

export interface ChainConfig {
    title: string,
    geyserPort: number,
    rpc: string,
    websocket: string,
    tracker?: {
        useWss?: boolean,
        useHttp?: boolean,
    },
    bridge?: {
        url?: string,
    }
}

export const kChains: {[key: string]: ChainConfig} = {
    [Chain.SOLANA]: {
        title: 'Solana',
        geyserPort: 3340, 
        rpc: process.env.SOLANA_RPC!,
        websocket: '',
    },
    [Chain.SONIC]: {
        title: 'Sonic SVM',
        geyserPort: 3344,
        rpc: process.env.SONIC_RPC!,
        websocket: process.env.SONIC_RPC_WSS!,
        tracker: {
            useWss: true,
            useHttp: true,
        },
        bridge: {
            url: 'https://bridge.sonic.game/'
        },
    },
    // [Chain.SONIC_TESTNET]: {
    //     title: 'Sonic SVM Testnet',
    //     geyserPort: 3345,
    //     rpc: process.env.SONIC_RPC_TESTNET!,
    //     websocket: process.env.SONIC_RPC_WSS_TESTNET!,
    //     tracker: {
    //         useWss: true,
    //         useHttp: false,
    //     },
    // },
    [Chain.SOON_MAINNET]: {
        title: 'SOON SVM',
        geyserPort: 3346,
        rpc: process.env.SOON_MAINNET_RPC!,
        websocket: process.env.SOON_MAINNET_RPC_WSS!,
        tracker: {
            useWss: false,
            useHttp: true,
        },
        bridge: {
            url: 'https://bridge.soo.network/home?chain=0'
        },
    },
    // [Chain.SOON_TESTNET]: {
    //     title: 'SOON SVM Testnet',
    //     geyserPort: 3347,
    //     rpc: process.env.SOON_TESTNET_RPC!,
    //     websocket: process.env.SOON_TESTNET_RPC_WSS!,
    //     tracker: {
    //         useWss: false,
    //         useHttp: true,
    //     },
    // },
    [Chain.SVMBNB_MAINNET]: {
        title: 'svmBNB',
        geyserPort: 3348,
        rpc: process.env.SVMBNB_MAINNET_RPC!,
        websocket: process.env.SVMBNB_MAINNET_RPC_WSS!,
        tracker: {
            useWss: false,
            useHttp: true,
        },
        bridge: {
            url: 'https://bridge.soo.network/home?chain=1'
        },
    },
    // [Chain.SVMBNB_TESTNET]: {
    //     title: 'svmBNB Testnet',
    //     geyserPort: 3349,
    //     rpc: process.env.SVMBNB_TESTNET_RPC!,
    //     websocket: process.env.SVMBNB_TESTNET_RPC_WSS!,
    //     tracker: {
    //         useWss: false,
    //         useHttp: true,
    //     },
    // },
    [Chain.SOONBASE_MAINNET]: {
        title: 'soonBase',
        geyserPort: 3351,
        rpc: process.env.SOONBASE_MAINNET_RPC!,
        websocket: process.env.SOONBASE_MAINNET_RPC_WSS!,
        tracker: {
            useWss: false,
            useHttp: true,
        },
        bridge: {
            url: 'https://bridge.soo.network/home?chain=2'
        },
    },
    // [Chain.SOONBASE_TESTNET]: {
    //     title: 'soonBase Testnet',
    //     geyserPort: 3352,
    //     rpc: process.env.SOONBASE_TESTNET_RPC!,
    //     websocket: process.env.SOONBASE_TESTNET_RPC_WSS!,
    //     tracker: {
    //         useWss: false,
    //         useHttp: true,
    //     },
    // },
};

export interface SubscriptionConfig {
    type: 'free' | SubscriptionTier,
    title: string,
    maxNumberOfWallets: number,
    maxNumberOfTraderProfiles: number,
}

export interface Engine {
    id: string,
    title: string,
    logo: string,
    isSubscriptionRequired: boolean,
    isExternal: boolean,
    url?: string,
    tokenUrl?: string,
}

export interface DexInfo {
    id: DexId,
    title: string,
    logo: string,
}

export enum DexId {
    RAYDIUM = 'raydium',
    PUMPFUN = 'pumpfun',
    METEORA = 'meteora',
    ORCA = 'orca',
    SEGA = 'sega',
    UNKNOWN = 'unknown',
}

export interface TimeBasedValue {
    '5m'?: number;
    '1h'?: number;
    '6h'?: number;
    '24h'?: number;
}