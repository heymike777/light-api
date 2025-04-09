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
    SONIC_TESTNET = 'sonic_testnet',
}

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
    UNKNOWN = 'unknown',
}

export interface TimeBasedValue {
    '5m'?: number;
    '1h'?: number;
    '6h'?: number;
    '24h'?: number;
}