import * as web3 from '@solana/web3.js';
import { RaydiumSwapInstructionData } from '../radium/RaydiumManager';

export interface DeserializedSwapTransaction {
    transaction: web3.VersionedTransaction;
    recentBlockhash: string;

    message?: web3.TransactionMessage;
    feePayer?: web3.PublicKey;
    swap?: RaydiumSwapInstructionData;
    mintAddress?: string;
    decimals?: number, 
    amount?: number, 
    solAmount?: number;

    type?: TransactionType;
}

export enum TransactionType {
    BUY = 'BUY',
    SELL = 'SELL'
}

export interface DeserializedTransaction {
    transaction: web3.VersionedTransaction;
    recentBlockhash: string;

    message?: web3.TransactionMessage;
    feePayer?: web3.PublicKey;
}