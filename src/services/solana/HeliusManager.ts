import { AddressLookupTableAccount, Keypair, TransactionInstruction } from '@solana/web3.js';
import { EnrichedTransaction, Helius, MintApiRequest } from "helius-sdk";
import { HeliusAsset, HeliusAssetDisplayOptions, MintApiResult } from './HeliusTypes';
import { Asset, AssetType, Priority } from './types';
import { kRaydiumAuthority } from './Constants';
import axios from 'axios';

export interface TokenHolder {
    owner: string;
    account: string;
    amount: string;
    uiAmount: number;
}

export class HeliusManager {

    static apiUrl = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
    static helius: Helius;

    static async initHelius(){
        if (!this.helius){
            this.helius = new Helius(process.env.HELIUS_API_KEY!);
        }
    }

    static async getTransaction(signature: string): Promise<EnrichedTransaction | undefined> {
        console.log(new Date(), 'HeliusManager', 'getTransaction', signature);
        this.initHelius();

        const apiEndpoint = this.helius.getApiEndpoint('/v0/transactions');
        const result = await axios.post(apiEndpoint, {
            transactions: [signature],
        });
        return result.data[0] || undefined;
    }

    static async mintCompressedNFT(params: MintApiRequest): Promise<MintApiResult> {
        this.initHelius();

        const response = await this.helius.mintCompressedNft(params);
        return response.result;
    }

    static async delegateCollectionAuthority(collectionMintAddress: string, keypair: Keypair, newCollectionAuthority: string){
        this.initHelius();

        const res = await this.helius.delegateCollectionAuthority({
            collectionMint: collectionMintAddress,
            newCollectionAuthority: newCollectionAuthority,
            updateAuthorityKeypair: keypair,
            payerKeypair: keypair,
        });
        console.log(new Date(), process.env.SERVER_NAME, 'delegateCollectionAuthority res', res);
    }

    static async revokeCollectionAuthority(collectionMintAddress: string, keypair: Keypair, delegatedCollectionAuthority: string){
        this.initHelius();

        const res = await this.helius.revokeCollectionAuthority({
            collectionMint: collectionMintAddress,
            delegatedCollectionAuthority: delegatedCollectionAuthority,
            revokeAuthorityKeypair: keypair,
            payerKeypair: keypair,
        });
        console.log(new Date(), process.env.SERVER_NAME, 'revokeCollectionAuthority res', res);
    }

    static async getAssetsByOwner(walletAddress: string, page = 1): Promise<HeliusAsset[]> {
        try{
            const limit = 1000;

            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 'my-id',
                    method: 'getAssetsByOwner',
                    params: {
                        ownerAddress: walletAddress,
                        page: page, // Starts at 1
                        limit: limit,
                        options: {
                            showFungible: true,
                            showZeroBalance: false,
                            showNativeBalance: true,
                        },
                    },
                }),
            });
            const { result } = await response.json() as any;
            const items = result?.items || [];

            if (items.length == limit && page < 3){
                const nextItems = await this.getAssetsByOwner(walletAddress, page+1);
                return items.concat(nextItems);
            }

            return items;
        }
        catch (e){
            console.error('getAssetsByOwner', e);
            return [];
        }
    }

    static async getAssetsByCreator(walletAddress: string, page = 1): Promise<HeliusAsset[]> {
        try {
            const limit = 1000;
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 'my-id',
                    method: 'getAssetsByCreator',
                    params: {
                        creatorAddress: walletAddress,
                        onlyVerified: true,
                        page: page, // Starts at 1
                        limit: limit,
                    },
                }),
            });
            const { result } = await response.json() as any;
            const items = result?.items || [];

            if (items.length == limit && page < 3){
                const nextItems = await this.getAssetsByCreator(walletAddress, page+1);
                return items.concat(nextItems);
            }

            return items;
        }
        catch (e){
            console.error('getAssetsByCreator', e);
            return [];
        }
    }

    static async getAssetBatch(mintTokens: string[], displayOptions: HeliusAssetDisplayOptions): Promise<HeliusAsset[]> {
        try{
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 'my-id',
                    method: 'getAssetBatch',
                    params: {
                        ids: mintTokens,
                        options: displayOptions,
                    },
                }),
            });
            const { result } = await response.json() as any;
            return result;
        }
        catch (e){
            // console.error('getAssetBatch', e);
            return [];
        }
    };

    static async getAsset(mintToken: string, displayOptions: HeliusAssetDisplayOptions): Promise<HeliusAsset | undefined> {
        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 'my-id',
                    method: 'getAsset',
                    params: {
                        id: mintToken,
                        displayOptions: {​
                            showUnverifiedCollections: true,​
                            showCollectionMetadata: false,​
                            showFungible: false,​
                            showInscription: false​
                        }
                    },
                }),
            });
            const { result } = await response.json() as any;
            return result;
        }
        catch (e){
            console.error('getAsset', e);
            return undefined;
        }
    };

    static async getFungibleAsset(mintToken: string): Promise<HeliusAsset | undefined> {
        const displayOptions: HeliusAssetDisplayOptions = {showFungible: true};
        return this.getAsset(mintToken, displayOptions);
    };

    static async getFungibleAssetBatch(mintTokens: string[]): Promise<HeliusAsset[]> {
        const displayOptions: HeliusAssetDisplayOptions = {showFungible: true};
        return this.getAssetBatch(mintTokens, displayOptions);
    };

    static async getDetailedAsset(mintToken: string): Promise<HeliusAsset | undefined> {
        const displayOptions: HeliusAssetDisplayOptions = {
            showUnverifiedCollections: true,
            showCollectionMetadata: true,
            showFungible: true,
            showInscription: true,
        };
        return this.getAsset(mintToken, displayOptions);
    };

    static async getDetailedAssets(mintTokens: string[]): Promise<HeliusAsset[]> {
        const displayOptions: HeliusAssetDisplayOptions = {
            showUnverifiedCollections: true,
            showCollectionMetadata: true,
            showFungible: true,
            showInscription: true,
        };
        return this.getAssetBatch(mintTokens, displayOptions);
    };

    static parseAssets(assets: HeliusAsset[]): Asset[] {
        const parsedAssets: Asset[] = [];

        for (const asset of assets){
            const parsedAsset = this.parseAsset(asset);
            if (parsedAsset) {
                parsedAssets.push(parsedAsset);
            }
        }

        return parsedAssets;
    }

    static parseAsset(asset: HeliusAsset): Asset | undefined {
        const imagesMimeTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
        // console.log(new Date(), process.env.SERVER_NAME, 'asset', JSON.stringify(asset));

        if (asset.burnt) { return undefined; }

        let assetType = AssetType.UNKNOWN;
        if (asset.interface == 'ProgrammableNFT'){
            assetType = AssetType.pNFT;
        }
        else if (asset.compression.compressed){
            assetType = AssetType.cNFT;
        }
        else if (asset.interface == 'Custom'){
            assetType = AssetType.NFT;
        }
        else if (asset.interface == 'V1_NFT'){
            assetType = AssetType.NFT;
        }
        else {
            return undefined;
        }

        const collection = asset.grouping.find(g => g.group_key == 'collection');

        const parsedAsset: Asset = {
            id: asset.id,
            type: assetType,
            title: asset.content.metadata.name.trim(),
            image: asset.content.files.find(f => imagesMimeTypes.includes(f.mime))?.uri,
            isDelegated: this.isAssetLocked(asset),
            collection: collection?.group_value ? { id: collection?.group_value } : undefined,
            creators: asset.creators,
        };

        return parsedAsset;
    }

    static isAssetLocked(asset: HeliusAsset): boolean {
        if (asset.interface == 'ProgrammableNFT'){
            return asset.ownership.delegated;
        }
        else {
            return asset.ownership.frozen;
        }
    }

    static recentPrioritizationFees: { fee: number, date: Date } | undefined;
    static async getRecentPrioritizationFees(forceCleanCache = false, priority: Priority = Priority.HIGH): Promise<number> {
        console.log(new Date(), process.env.SERVER_NAME, 'getRecentPrioritizationFees', 'priority:', priority);
        
        if (priority == Priority.LOW){
            return 1_000_000;
        }

        if (!forceCleanCache && this.recentPrioritizationFees && (new Date().getTime() - this.recentPrioritizationFees.date.getTime()) < 60 * 1000){
            return this.recentPrioritizationFees.fee;
        }


        let minMicroLamports = 100_000_000;
        let maxMicroLamports = 300_000_000;

        let fees = minMicroLamports;

        try{
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: 1,
                    method: "getPriorityFeeEstimate",
                    params: [{
                        "accountKeys": ["JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"],
                        "options": {
                            "includeAllPriorityFeeLevels": true,
                        }
                    }]
                }),
            });

            const { result } = await response.json() as any;

            if (result?.priorityFeeLevels?.high){
                fees = Math.ceil(result.priorityFeeLevels.high);
            }

            if (fees < minMicroLamports){ fees = minMicroLamports; }
            if (fees >= maxMicroLamports){ fees = maxMicroLamports; }

            this.recentPrioritizationFees = { fee: fees, date: new Date() };
        }
        catch(e){
            console.error('getRecentPrioritizationFees', e);
        }

        return fees;
    };

        
    static async sendSmartTransaction(instructions: TransactionInstruction[], keypair: Keypair, lookupTables?: AddressLookupTableAccount[], tipsLamports?: number){
        this.initHelius();

        try{
            const transactionSignature = await this.helius.rpc.sendSmartTransaction(instructions, [keypair], lookupTables, {skipPreflight: true, maxRetries: 1, lastValidBlockHeightOffset: 0});
            console.log(`Helius sendSmartTransaction - Successful transfer: ${transactionSignature}`);    
        }
        catch (err){
            console.error('Helius sendSmartTransaction', err);
        }

        // try{
        //     const transactionSignatureJito = await this.helius.rpc.sendSmartTransactionWithTip(instructions, [keypair], lookupTables, tipsLamports, 'Amsterdam'); 
        //     console.log(`Helius sendSmartTransactionWithTip - Successful transfer: ${transactionSignatureJito}`);
        // }
        // catch (err){
        //     console.error('Helius sendSmartTransactionWithTip', err);
        // }
    }

    static async getTokenHolders(mint: string, includeEmpty: Boolean = false, includeSpecialWallets: Boolean = false): Promise<TokenHolder[]> {
        this.initHelius();

        const res = await this.helius.rpc.getTokenHolders(mint);
        // console.log(new Date(), process.env.SERVER_NAME, 'getTokenHolders res', JSON.stringify(res, null, 2));

        const holders: TokenHolder[] = [];
        const specialWallets: string[] = [
            kRaydiumAuthority
        ];

        for (const item of res) {
            if ('parsed' in item.account.data){
                const owner = item.account.data.parsed.info.owner;
                if (item.account.data.parsed.info.tokenAmount.amount != '0' || includeEmpty){
                    if (!includeSpecialWallets && specialWallets.includes(owner)){
                        continue;
                    }

                    holders.push({
                        owner: owner,
                        account: item.pubkey.toBase58(),
                        amount: item.account.data.parsed.info.tokenAmount.amount,
                        uiAmount: item.account.data.parsed.info.tokenAmount.uiAmount,
                    });
                }
            }
        }

        // sort by uiAmount
        holders.sort((a, b) => b.uiAmount - a.uiAmount);

        return holders
    }

}