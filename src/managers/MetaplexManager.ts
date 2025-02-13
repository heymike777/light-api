import { DigitalAsset, fetchAllDigitalAsset } from '@metaplex-foundation/mpl-token-metadata'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { getRpc } from '../services/solana/lib/solana';
import { publicKey, Commitment } from '@metaplex-foundation/umi';
import { dasApi, DasApiAsset } from '@metaplex-foundation/digital-asset-standard-api';
import { findLeafAssetIdPda, mplBubblegum } from '@metaplex-foundation/mpl-bubblegum';
import { ExplorerManager } from '../services/explorers/ExplorerManager';
import { TokenNft, TokenNftAttribute } from '../entities/tokens/Token';
import { LogManager } from './LogManager';

export class MetaplexManager {

    static commitment: Commitment = 'processed';
    static assetsCache: {[key: string]: {id: string, asset: DasApiAsset, createdAt: number}} = {};

    static async fetchAllDigitalAssets(mints: string[]): Promise<DigitalAsset[]> {
        try {
            const umi = createUmi(getRpc(), this.commitment); 
            const pubKeys = mints.map(mint => publicKey(mint));
            const assets = await fetchAllDigitalAsset(umi, pubKeys);
            return assets;
        }
        catch (error) {
            LogManager.error('MetaplexManager', 'fetchAllDigitalAssets', error);
        }        
        return [];
    }

    static async fetchAsset(assetId: string): Promise<DasApiAsset | undefined> {
        LogManager.log('MetaplexManager', '!fetchAsset', assetId);
        const existingAsset = this.assetsCache[assetId]
        if (existingAsset){
            return existingAsset.asset;
        }

        try {
            const umi = createUmi(process.env.HELIUS_SHARED_RPC!, this.commitment); 
            umi.use(dasApi())
            const asset = await umi.rpc.getAsset(publicKey(assetId));
            if (asset){
                this.assetsCache[assetId] = {id: assetId, asset, createdAt: Date.now()};
            }
            return asset;
        }
        catch (error) {
            LogManager.error('MetaplexManager', 'fetchAsset', error);
        }        
        return undefined;
    }

    static async fetchAssetAndParseToTokenNft(assetId: string): Promise<TokenNft | undefined> {
        try {
            const asset = await this.fetchAsset(assetId);
            // LogManager.log('tmp', asset);
            if (asset){
                if (asset.interface as string == 'FungibleToken'){
                    // LogManager.error('MetaplexManager', 'fetchAssetAndParseToTokenNft', 'asset is not NFT', asset);
                    return undefined;
                }

                let image: string | undefined = undefined;
                let links: any = asset.content.links;
                if (!image && links?.[0]?.['image']){ image = '' + links[0]['image']; }
                if (!image && links?.['image']){ image = '' + links['image']; }
                
                asset.content.links?.[0] ? '' + asset.content.links?.[0]['image'] : undefined;
                const attributes: TokenNftAttribute[] = [];
                if (asset.content.metadata.attributes){
                    for (const attr of asset?.content.metadata.attributes) {
                        if (attr.trait_type && attr.value){
                            attributes.push({
                                trait_type: attr.trait_type,
                                value: attr.value,
                            });
                        }
                    }
                }
                
                const nftAsset: TokenNft = {
                    id: asset.id.toString(),
                    title: asset.content.metadata.name,
                    image: image,
                    uri: asset.content.json_uri,
                    attributes: attributes,
                    marketplace: ExplorerManager.getMarketplace(asset.id.toString()),
                };

                return nftAsset;
            }
        }
        catch (error) {
            LogManager.error('MetaplexManager', 'fetchAsset', error);
        }        
        return undefined;
    }
    
    static fetchAssetIdByTreeAnfLeafIndex(merkleTree: string, leafIndex: number): string | undefined {
        try {
            const umi = createUmi(process.env.HELIUS_SHARED_RPC!, this.commitment); 
            umi.use(dasApi())
            umi.use(mplBubblegum())

            const [assetId, bump] = findLeafAssetIdPda(umi, {
                merkleTree: publicKey(merkleTree),
                leafIndex,
            });

            return assetId.toString();
        }
        catch (error) {
            LogManager.error('MetaplexManager', 'fetchAsset', error);
        }        
        return undefined;
    }

}