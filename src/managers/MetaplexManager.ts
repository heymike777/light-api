import { DigitalAsset, fetchAllDigitalAsset } from '@metaplex-foundation/mpl-token-metadata'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { getRpc } from '../services/solana/lib/solana';
import { publicKey } from '@metaplex-foundation/umi';
import { dasApi, DasApiAsset } from '@metaplex-foundation/digital-asset-standard-api';

export class MetaplexManager {

    static async fetchAllDigitalAssets(mints: string[]): Promise<DigitalAsset[]> {
        try {
            const umi = createUmi(getRpc()); 
            const pubKeys = mints.map(mint => publicKey(mint));
            const assets = await fetchAllDigitalAsset(umi, pubKeys);
            return assets;    
        }
        catch (error) {
            console.error('MetaplexManager', 'fetchAllDigitalAssets', error);
        }        
        return [];
    }

    static async fetchAsset(assetId: string): Promise<DasApiAsset | undefined> {
        try {
            const umi = createUmi(process.env.HELIUS_SHARED_RPC!); 
            umi.use(dasApi())
            const asset = await umi.rpc.getAsset(publicKey(assetId));
            return asset;
        }
        catch (error) {
            console.error('MetaplexManager', 'fetchAsset', error);
        }        
        return undefined;
    }
    
}