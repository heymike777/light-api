export interface MintApiResult {
    signature: string;
    minted: boolean;
    assetId: string;
}

export interface HeliusAsset {
    interface: string;
    id: string;
    content: {
        $schema: string;
        json_uri: string;
        files: {
            uri: string;
            cdn_uri: string;
            mime: string;
        }[];
        metadata: {
            attributes: {
                value: string;
                trait_type: string;
            }[];
            description: string;
            name: string;
            symbol: string;
        };
        links: {
            image: string;
        };
    };
    authorities: {
        address: string;
        scopes: string[];
    }[];
    compression: {
        eligible: boolean;
        compressed: boolean;
        data_hash: string;
        creator_hash: string;
        asset_hash: string;
        tree: string;
        seq: number;
        leaf_id: number;
    };
    grouping: {
        group_key: string;
        group_value: string;
    }[];
    royalty: {
        royalty_model: string;
        target: string | null;
        percent: number;
        basis_points: number;
        primary_sale_happened: boolean;
        locked: boolean;
    };
    creators: {
        address: string;
        share: number;
        verified: boolean;
    }[];
    ownership: {
        frozen: boolean;
        delegated: boolean;
        delegate: string | null;
        ownership_model: string;
        owner: string;
        supply: string;
        mutable: boolean;
        burnt: boolean;
    }
    supply: {
        print_max_supply: number;
        print_current_supply: number;
        edition_nonce: number | null;
    } | null;
    token_info: {
        symbol: string;
        supply: number;
        decimals: number;
        token_program: string;
        mint_authority: string;
        freeze_authority: string;
        price_info?: {
            price_per_token: number;
            currency: string;
        }
    };
    mint_extensions: any;//TODO
    mutable: boolean;
    burnt: boolean;
}

export interface HeliusAssetDisplayOptions {​
    showUnverifiedCollections?: boolean;
    showCollectionMetadata?: boolean;
    showFungible?: boolean;
    showInscription?: boolean;
}