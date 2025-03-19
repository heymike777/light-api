import { DigitalAsset, fetchAllDigitalAsset, findMetadataPda } from '@metaplex-foundation/mpl-token-metadata'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { getRpc, getSharedRpc, newConnectionByChain } from '../services/solana/lib/solana';
import { publicKey, Commitment, deserializeAccount } from '@metaplex-foundation/umi';
import { dasApi, DasApiAsset } from '@metaplex-foundation/digital-asset-standard-api';
import { findLeafAssetIdPda, mplBubblegum } from '@metaplex-foundation/mpl-bubblegum';
import { ExplorerManager } from '../services/explorers/ExplorerManager';
import { TokenNft, TokenNftAttribute } from '../entities/tokens/Token';
import { LogManager } from './LogManager';
import { Chain } from '../services/solana/types';
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { SolanaManager } from '../services/solana/SolanaManager';
import * as web3 from '@solana/web3.js';
import * as Metadata from '@metaplex-foundation/mpl-token-metadata';
import axios from 'axios';
import { fetchMint, fetchToken, findAssociatedTokenPda, safeFetchToken } from '@metaplex-foundation/mpl-toolbox';

export class MetaplexManager {

    static commitment: Commitment = 'processed';
    static assetsCache: {[key: string]: {id: string, asset: DasApiAsset, createdAt: number}} = {};

    static async fetchAllDigitalAssets(chain: Chain, mints: string[]): Promise<DigitalAsset[]> {
        const umi = createUmi(getRpc(chain).http, this.commitment); 
        umi.use(dasApi());
        umi.use(mplTokenMetadata());
        const assets: DigitalAsset[] = [];

        if (chain === Chain.SOLANA){
            try {
                const pubKeys = mints.map(mint => publicKey(mint));
                const tmpAssets = await fetchAllDigitalAsset(umi, pubKeys);
                assets.push(...tmpAssets);
            }
            catch (error) {
                LogManager.error('MetaplexManager', 'fetchAllDigitalAssets', error);
            }      
        }  

        const leftMints = mints.filter(mint => !assets.find(asset => asset.mint.toString() == mint));
        if (leftMints.length > 0){
            LogManager.log('MetaplexManager', 'fetchAllDigitalAssets', 'leftMints', leftMints);

            for (const mint of leftMints) {
                const tmpAsset = await this.getDigitalAssetManually(chain, mint);
                if (tmpAsset){
                    assets.push(tmpAsset);
                }
            }
        }

        return assets;
    }

    static async getDigitalAssetManually(chain: Chain, mint: string): Promise<DigitalAsset | undefined> {
        LogManager.log('getDigitalAssetManually', chain, mint);

        try {
            const umi = createUmi(getRpc(chain).http, this.commitment); 
            // umi.use(dasApi());
            // umi.use(mplTokenMetadata());
    
            const mintAccount = await fetchMint(umi, publicKey(mint));

            const connection = newConnectionByChain(chain);
            let accountInfo = await connection.getParsedAccountInfo(new web3.PublicKey(mint));
            const data: any = accountInfo.value?.data;
            const owner = accountInfo.value?.owner; // program owner

            const extensions = data?.parsed?.info?.extensions;
            if (extensions){
                for (const extension of extensions) {
                    if (extension.extension == 'tokenMetadata' && extension.state?.mint == mint){
                        const metadata: any = {
                            name: extension.state?.name || '',
                            symbol: extension.state?.symbol || '',
                            uri: extension.state?.uri || '',
                        };

                        const digitalAsset: DigitalAsset = {
                            publicKey: publicKey(mint),
                            mint: mintAccount,
                            metadata: metadata
                        };
                        return digitalAsset;          
                    }
                }
            }
        }
        catch (error) {
            LogManager.error('MetaplexManager', 'fetchAllDigitalAssets', error);
        }

        return undefined;
    }

    static async fetchAsset(chain: Chain, assetId: string): Promise<DasApiAsset | undefined> {
        if (chain !== Chain.SOLANA) return;

        LogManager.log('MetaplexManager', '!fetchAsset', assetId);
        const existingAsset = this.assetsCache[assetId]
        if (existingAsset){
            return existingAsset.asset;
        }

        try {
            const rpc = getSharedRpc(chain);
            const umi = createUmi(rpc.http, this.commitment); 
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

    static async fetchAssetAndParseToTokenNft(chain: Chain, assetId: string): Promise<TokenNft | undefined> {
        try {
            const asset = await this.fetchAsset(chain, assetId);
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
                                value: '' + attr.value,
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
    
    static fetchAssetIdByTreeAnfLeafIndex(chain: Chain, merkleTree: string, leafIndex: number): string | undefined {
        if (chain !== Chain.SOLANA) return;
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