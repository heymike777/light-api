import { Connection } from "@solana/web3.js";
import { newConnection } from "../../services/solana/lib/solana";
import { Chain } from "../../services/solana/types";

export interface SVM {
    id: string;
    name: string;
    chain: Chain;
    rpc: string;
    wss: string;
    connection: Connection;
}

export const kSonicSvmMainnet: SVM = {
    id: 'sonic-mainnet',
    name: 'SONIC',
    chain: Chain.SONIC,
    rpc: process.env.SONIC_RPC || 'https://sonic.helius-rpc.com/',
    wss: process.env.SONIC_RPC_WSS || 'wss://sonic.helius-rpc.com/',
    connection: new Connection(process.env.SONIC_RPC || 'https://sonic.helius-rpc.com/'),
};

export class SvmManager {
    
}