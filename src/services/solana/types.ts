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
    LOW = 'LOW',
    HIGH = 'HIGH'
}

export enum Chain {
    SOLANA = 'sol',
    ETHEREUM = 'eth',
    TON = 'ton',
    TRON = 'tron',
    NEAR = 'near',
}

export interface SubscriptionConfig {
    type: 'free' | SubscriptionTier,
    title: string,
    maxNumberOfWallets: number,
    maxNumberOfTradingProfiles: number,
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

export interface Dex {
    id: string,
    title: string,
    logo: string,
}