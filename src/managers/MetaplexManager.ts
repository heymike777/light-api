import { DigitalAsset, fetchAllDigitalAsset } from '@metaplex-foundation/mpl-token-metadata'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { getRpc } from '../services/solana/lib/solana';
import { publicKey } from '@metaplex-foundation/umi';
import { dasApi, DasApiAsset } from '@metaplex-foundation/digital-asset-standard-api';
import { TokenNft, TokenNftAttribute } from './TokenManager';
import { findLeafAssetIdPda, mplBubblegum } from '@metaplex-foundation/mpl-bubblegum';

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

    static async fetchAssetAndParseToTokenNft(assetId: string): Promise<TokenNft | undefined> {
        try {
            const tmp = await this.fetchAsset(assetId);

            if (tmp){
                let image: string | undefined = undefined;
                let links: any = tmp.content.links;
                if (!image && links?.[0]?.['image']){ image = '' + links[0]['image']; }
                if (!image && links?.['image']){ image = '' + links['image']; }
                
                tmp.content.links?.[0] ? '' + tmp.content.links?.[0]['image'] : undefined;
                const attributes: TokenNftAttribute[] = [];
                if (tmp.content.metadata.attributes){
                    for (const attr of tmp?.content.metadata.attributes) {
                        if (attr.trait_type && attr.value){
                            attributes.push({
                                trait_type: attr.trait_type,
                                value: attr.value,
                            });
                        }
                    }
                }
                
                const asset: TokenNft = {
                    id: tmp.id.toString(),
                    title: tmp.content.metadata.name,
                    image: image,
                    uri: tmp.content.json_uri,
                    attributes: attributes,
                };

                return asset;
            }
        }
        catch (error) {
            console.error('MetaplexManager', 'fetchAsset', error);
        }        
        return undefined;
    }
    
    static fetchAssetIdByTreeAnfLeafIndex(merkleTree: string, leafIndex: number): string | undefined {
        try {
            const umi = createUmi(process.env.HELIUS_SHARED_RPC!); 
            umi.use(dasApi())
            umi.use(mplBubblegum())

            const [assetId, bump] = findLeafAssetIdPda(umi, {
                merkleTree: publicKey(merkleTree),
                leafIndex,
            });

            return assetId.toString();
        }
        catch (error) {
            console.error('MetaplexManager', 'fetchAsset', error);
        }        
        return undefined;
    }

}