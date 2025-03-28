import { ApiV3PoolInfoStandardItem, ApiV3PoolInfoStandardItemCpmm } from "@raydium-io/raydium-sdk-v2";

export class MemoryManager {

    static poolByMintAddress: { [key: string]:  ApiV3PoolInfoStandardItem | ApiV3PoolInfoStandardItemCpmm } = {}; // Raydium AMM

}