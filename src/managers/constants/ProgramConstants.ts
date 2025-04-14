export enum kProgram {
    SOLANA = '11111111111111111111111111111111',
    TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    TOKEN_EXTENSIONS_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
    COMPUTE_BUDGET = 'ComputeBudget111111111111111111111111111111',
    STAKE_PROGRAM = 'Stake11111111111111111111111111111111111111',
    
    RAYDIUM_AMM = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
    RAYDIUM_CLMM = 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
    RAYDIUM_CPMM = 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',
    // RAYDIUM_STABLE_SWAP_APP = '5quBtoiQqxF9Jv6KYKctB59NT3gtJD2Y65kdnB1Uev3h',
    // RAYDIUM_APP_ROUTING = 'routeUGWgWzqBWFcrCfv8tritsqukccJPu3q5GPP3xS',

    JUPITER = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
    JUPITER_Z = '61DFfeTKM7trxYcPQCM78bJ794ddZprZpAwAnLiwTpYH',
    JUPITER_LIMIT_ORDERS = 'j1o2qRpjcyUwEvwtcfhEQefh773ZgjxcVRry7LDqg5X',
    JUP_DAO = 'voTpe3tHQ7AjQHMapgSue2HJFAh2cGsdokqN3XqmVSj',
    JUP_GOVERNANCE = 'GovaE4iu227srtG2s3tZzB4RmWBzw8sTwrCLZz7kN7rY',

    SOL_INCINERATOR = 'F6fmDVCQfvnEq2KR8hhfZSEczfM9JK9fWbCsYJNbTGn7',
    TENSOR = 'TSWAPaqyCSx2KABk68Shruf4rp7CxcNi8hAsbdwmHbN',
    TENSOR_CNFT = 'TCMPhJdwDryooaGtiocG1u3xcYbRpiJzb283XfCZsDp',
    MAGIC_EDEN_AMM = 'mmm3XBJg5gk8XJxEKBvdgptZz6SgK4tXvn36sodowMc',
    MAGIC_EDEN_V2 = 'M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K',
    MAGIC_EDEN_V3 = 'M3mxk5W2tt27WGT7THox7PmgRDp4m6NEhL5xvxrBfS1',
    BUBBLEGUM = 'BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY',
    BONK_REWARDS = 'STAKEkKzbdeKkqzKpLkNQD3SUuLgshDKCD7U8duxAbB',
    PUMPFUN = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
    PUMPFUN_AMM = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA',
    METEORA_DLMM = 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',
    METEORA_POOLS = 'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB',
    OKX = '6m2CDdhRgxpH4WjvdzxAYbGxwdGUz5MziiL5jek2kBma',
    ORCA = 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',

    GO_FUND_MEME = 'GFMioXjhuDWMEBtuaoaDPJFPEnL2yDHCWKoVPhj1MeA7',

    TITAN_DEX = 'T1TANpTeScyeqVzzgNViGDNrkQ6qHz9KrSBS4aNXvGT',
    KAMINO_LIMIT_ORDER = 'LiMoM9rMhrdYrfzUCxQppvxCSG1FcrUK9G8uLq4A1GF',

    // SONIC SVM
    SONIC_STAKING = 'g3yMgSB3Q7gNjMfSoCm1PiJihqHdNJeUuPHvRyf45qY',
    SEGA = 'SegazTQwbYWknDZkJ6j2Kgvm5gw3MrHGKtWstZdoNKZ',

}

export interface KnownInstruction {
    title: string, 
    priority: number, 
}

export const kPrograms: { [key: string]: {
    name?: string,
    knownInstructions: {[key: string]: KnownInstruction}[],
    skip?: boolean,
    skipIdl?: boolean,
    searchLogs?: boolean,
    customIdl?: { path: string, type: 'anchor' | 'anchorV1' | 'shank' | 'kinobi' },
    fee?: {
        account: string,
        amount: number,
    }
} } = {
    [kProgram.SOLANA]: {
        name: undefined,
        knownInstructions: [
            { 'transferChecked': {title: 'TRANSFER', priority: 100} },
            { 'transfer': {title: 'TRANSFER', priority: 100} },
        ],
        skip: false,
    },
    [kProgram.STAKE_PROGRAM]: {
        name: 'STAKE PROGRAM',
        knownInstructions: [
            { 'delegate': {title: 'STAKE SOL', priority: 20} },
            { 'withdraw': {title: 'UNSTAKE SOL', priority: 20} },
            { 'deactivate': {title: 'DEACTIVATE STAKE', priority: 21} },
            { 'merge': {title: 'MERGE STAKE', priority: 22} },
            { 'split': {title: 'SPLIT STAKE', priority: 22} },
        ],
        skip: false,
    },
    [kProgram.TOKEN_PROGRAM]: {
        name: 'TOKEN PROGRAM',
        knownInstructions: [
            { 'transferChecked': {title: 'TRANSFER', priority: 100} },
            { 'transfer': {title: 'TRANSFER', priority: 100} },
        ],
        skip: false,
    },
    [kProgram.TOKEN_EXTENSIONS_PROGRAM]: {
        name: 'TOKEN PROGRAM',
        knownInstructions: [
            { 'transfer': {title: 'TRANSFER', priority: 100} },
            { 'transferChecked': {title: 'TRANSFER', priority: 100} },
            { 'transferFeeExtension': {title: 'TRANSFER', priority: 100} },
        ],
        skip: false,
    },
    [kProgram.COMPUTE_BUDGET]: {
        name: undefined,
        knownInstructions: [],
        skip: true,
    },
    [kProgram.RAYDIUM_AMM]: {
        name: 'RAYDIUM',
        knownInstructions: [
            { 'swapBaseIn': {title: 'SWAP', priority: 2} },
            { 'swapBaseOut': {title: 'SWAP', priority: 2} },
            { 'initialize': {title: 'ADD LIQUIDOTY', priority: 3} },
            { 'initialize2': {title: 'ADD LIQUIDOTY', priority: 3} },
        ],
        skip: false,
    },
    [kProgram.RAYDIUM_CLMM]: {
        name: 'RAYDIUM',
        knownInstructions: [
            { 'swap': {title: 'SWAP', priority: 2} },
            { 'swapV2': {title: 'SWAP', priority: 2} },
            { 'swapRouterBaseIn': {title: 'SWAP', priority: 2} },
            { 'decreaseLiquidity': {title: 'REMOVE LIQUIDOTY', priority: 3} },
            { 'decreaseLiquidityV2': {title: 'REMOVE LIQUIDOTY', priority: 3} },
            { 'increaseLiquidity': {title: 'ADD LIQUIDOTY', priority: 3} },
            { 'increaseLiquidityV2': {title: 'ADD LIQUIDOTY', priority: 3} },
        ],
        skip: false,
    },
    [kProgram.RAYDIUM_CPMM]: {
        name: 'RAYDIUM',
        knownInstructions: [
            { 'swapBaseInput': {title: 'SWAP', priority: 2} },
            { 'swapBaseOutput': {title: 'SWAP', priority: 2} },
            { 'deposit': {title: 'ADD LIQUIDOTY', priority: 3} },
            { 'withdraw': {title: 'REMOVE LIQUIDOTY', priority: 3} },
        ],
        skip: false,
    },
    [kProgram.JUPITER]: {
        name: 'JUPITER',
        knownInstructions: [
            { 'routeWithTokenLedger': {title: 'SWAP', priority: 1} },
            { 'route_with_token_ledger': {title: 'SWAP', priority: 1} },
            { 'sharedAccountsRoute': {title: 'SWAP', priority: 1} },
            { 'shared_accounts_route': {title: 'SWAP', priority: 1} },
            { 'route': {title: 'SWAP', priority: 1} },
            { 'exactOutRoute': {title: 'SWAP', priority: 1} },
            { 'exact_out_route': {title: 'SWAP', priority: 1} },
            { 'sharedAccountsRouteWithTokenLedger': {title: 'SWAP', priority: 1} },
            { 'shared_accounts_route_with_token_ledger': {title: 'SWAP', priority: 1} },
            { 'sharedAccountsExactOutRoute': {title: 'SWAP', priority: 1} },
            { 'shared_accounts_exact_out_route': {title: 'SWAP', priority: 1} },
            { 'claim': {title: 'CLAIM', priority: 5} },
            { 'claimToken': {title: 'CLAIM', priority: 5} },
            { 'claim_token': {title: 'CLAIM', priority: 5} },
        ],
        skip: false,
        customIdl: {
            path: 'src/idls/jupiter_v6.json',
            type: 'anchorV1',
        },
    },
    [kProgram.JUPITER_Z]: {
        name: 'JUPITER Z',
        knownInstructions: [
            { 'fill': {title: 'SWAP', priority: 1} },
        ],
        skip: false,
    },
    [kProgram.PUMPFUN]: {
        name: 'PUMPFUN',
        knownInstructions: [
            { 'buy': {title: 'BUY', priority: 3} },
            { 'sell': {title: 'SELL', priority: 3} },
            { 'create': {title: 'CREATE TOKEN', priority: 2} },
            { 'withdraw': {title: 'REMOVE LIQUIDITY', priority: 3} },
        ],
        skip: false,
        customIdl: {
            path: 'src/idls/pumpfun.json',
            type: 'anchor',
        },
        fee: {
            account: 'CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM',
            amount: 0.01,
        }
    },
    [kProgram.SOL_INCINERATOR]: {
        name: 'SOL INCINERATOR',
        knownInstructions: [],
        skip: true,
    },
    [kProgram.TENSOR]: {
        name: 'TENSOR',
        knownInstructions: [
            { 'buyNft': {title: 'NFT SALE', priority: 3} },
            { 'buySingleListing': {title: 'NFT SALE', priority: 3} },
            { 'sellNftTokenPool': {title: 'NFT SALE', priority: 3} },
            { 'sellNftTradePool': {title: 'NFT SALE', priority: 3} },
            { 'buyNftT22': {title: 'NFT SALE', priority: 3} },
            { 'list': {title: 'NFT LISTING', priority: 5} },
            { 'delist': {title: 'NFT DELIST', priority: 5} },
        ],
        skip: false,
    },
    [kProgram.TENSOR_CNFT]: {
        name: 'TENSOR',
        knownInstructions: [
            { 'buy': {title: 'NFT SALE', priority: 3} },
            { 'buySpl': {title: 'NFT SALE', priority: 3} },
            { 'buyCore': {title: 'NFT SALE', priority: 3} },
            { 'list': {title: 'NFT LISTING', priority: 5} },
            { 'listCore': {title: 'NFT LISTING', priority: 5} },
            { 'delist': {title: 'NFT DELIST', priority: 5} },
            { 'delistCore': {title: 'NFT DELIST', priority: 5} },
            { 'takeBidFullMeta': {title: 'NFT SALE', priority: 3} }
        ],
        skip: false,
    },
    [kProgram.MAGIC_EDEN_AMM]: {
        name: 'MAGIC EDEN',
        knownInstructions: [
            { 'solFulfillBuy': {title: 'NFT SALE', priority: 3} },
            { 'solMip1FulfillBuy': {title: 'NFT SALE', priority: 3} },
            { 'solOcpFulfillBuy': {title: 'NFT SALE', priority: 3} },
            { 'solExtFulfillBuy': {title: 'NFT SALE', priority: 3} },
            { 'solMplCoreFulfillBuy': {title: 'NFT SALE', priority: 3} },
            { 'solFulfillSell': {title: 'NFT SALE', priority: 3} },
            { 'solMip1FulfillSell': {title: 'NFT SALE', priority: 3} },
            { 'solOcpFulfillSell': {title: 'NFT SALE', priority: 3} },
            { 'solExtFulfillSell': {title: 'NFT SALE', priority: 3} },
            { 'solMplCoreFulfillSell': {title: 'NFT SALE', priority: 3} },
        ],
        skip: false,
    },
    [kProgram.MAGIC_EDEN_V2]: {
        name: 'MAGIC EDEN',
        knownInstructions: [
            { 'mip1Sell': {title: 'NFT LISTING', priority: 5} },
            { 'mip1CancelSell': {title: 'NFT DELIST', priority: 5} },
            { 'sell': {title: 'NFT SALE', priority: 3} },
            { 'coreSell': {title: 'NFT SALE', priority: 3} },
            { 'buy': {title: 'NFT SALE', priority: 3} },
            { 'buyV2': {title: 'NFT SALE', priority: 3} },
        ],
        skip: false,
    },    
    [kProgram.MAGIC_EDEN_V3]: {
        name: 'MAGIC EDEN',
        knownInstructions: [
            { 'buyNow': {title: 'NFT SALE', priority: 3} },
            { 'sell': {title: 'NFT LISTING', priority: 5} },
            { 'cancelSell': {title: 'NFT DELIST', priority: 5} },
        ],
        skip: false,
    },    
    [kProgram.BUBBLEGUM]: {
        name: 'BUBBLEGUM',
        knownInstructions: [
            { 'transfer': {title: 'TRANSFER', priority: 10} },
        ],
        skip: false,
    },   
    [kProgram.BONK_REWARDS]: {
        name: 'BONK REWARDS',
        knownInstructions: [
            { 'deposit': {title: 'DEPOSIT', priority: 3} },
            { 'claimAll': {title: 'CLAIM ALL', priority: 5} },
            { 'withdraw': {title: 'WITHDRAW', priority: 3} },
            { 'moveToExpiredPool': {title: 'STAKE EXPIRED', priority: 6} },
            { 'withdrawStakeAndExpiredRewards': {title: 'WITHDRAW', priority: 4} },
        ],
        skip: false,
    }, 
    [kProgram.JUP_DAO]: {
        name: 'JUP DAO',
        knownInstructions: [
            { 'withdraw': {title: 'WITHDRAW', priority: 1} },
            { 'increaseLockedAmount': {title: 'STAKE', priority: 1} },
            { 'toggleMaxLock': {title: 'UNSTAKE', priority: 2} },
        ],
        skip: false,
    },
    [kProgram.JUP_GOVERNANCE]: {
        name: 'JUP GOVERNANCE',
        knownInstructions: [
            { 'setVote': {title: 'VOTE', priority: 1} },
        ],
        skip: false,
    },
    [kProgram.METEORA_DLMM]: {
        name: 'METEORA DLMM',
        knownInstructions: [
            { 'swap': {title: 'SWAP', priority: 2} },
            { 'swapExactOut': {title: 'SWAP', priority: 2} },
            { 'swapWithPriceImpact': {title: 'SWAP', priority: 2} },

            { 'removeLiquidityByRange': {title: 'REMOVE LIQUIDITY', priority: 3} },
            { 'removeLiquidity': {title: 'REMOVE LIQUIDITY', priority: 3} },

            { 'addLiquidity': {title: 'ADD LIQUIDITY', priority: 3} },
            { 'addLiquidityByWeight': {title: 'ADD LIQUIDITY', priority: 3} },
            { 'addLiquidityByStrategy': {title: 'ADD LIQUIDITY', priority: 3} },
            { 'addLiquidityByStrategyOneSide': {title: 'ADD LIQUIDITY', priority: 3} },
            { 'addLiquidityOneSidePrecise': {title: 'ADD LIQUIDITY', priority: 3} },
            { 'addLiquidityOneSide': {title: 'ADD LIQUIDITY', priority: 3} },
        ],
        skip: false,
    },
    [kProgram.METEORA_POOLS]: {
        name: 'METEORA POOLS',
        knownInstructions: [
            { 'swap': {title: 'SWAP', priority: 2} },
            { 'removeLiquiditySingleSide': {title: 'REMOVE LIQUIDITY', priority: 3} },
            { 'removeBalanceLiquidity': {title: 'REMOVE LIQUIDITY', priority: 3} },
            { 'addImbalanceLiquidity': {title: 'ADD LIQUIDITY', priority: 3} },
            { 'addBalanceLiquidity': {title: 'ADD LIQUIDITY', priority: 3} },
            { 'bootstrapLiquidity': {title: 'BOOTSTRAP LIQUIDITY', priority: 4} },
        ],
        skip: false,
    },
    [kProgram.OKX]: {
        name: 'OKX',
        knownInstructions: [
            // unknown instruction // 3fqErnmTwdQaVaGTwoKAQGrF128NKbAPGQWkUmkgQNpTkBg7o2GtHPcpndRrMJAanxvue8BvLftSS7nTcuedq1Rz
            { 'commission_spl_swap2': {title: 'SWAP', priority: 1} }, // MiFmesuZdBqWExGoJcoovp6dVkN6V1BVjG1bAWYYRugv7DgyMwGeEtjQGzdzGxGWsaM8zQPtRgeo5n9tgv1f1D6
            { 'swap2': {title: 'SWAP', priority: 1} }, // 4Nv2v2TVajU6ExfmGU2EoEWN9yZz47cyScYfYB2CWtjRhNdJhHwXa19itQ4KW6bk135sULPyBdZeHKTdvvtMcAnw
        ],
        skip: false,
    },
    [kProgram.ORCA]: {
        name: 'ORCA',
        knownInstructions: [
            { 'swap': {title: 'SWAP', priority: 2} },
            { 'swapV2': {title: 'SWAP', priority: 2} },
            { 'twoHopSwap': {title: 'SWAP', priority: 2} },
            { 'twoHopSwapV2': {title: 'SWAP', priority: 2} },

            { 'decreaseLiquidity': {title: 'REMOVE LIQUIDITY', priority: 3} },
            { 'decreaseLiquidityV2': {title: 'REMOVE LIQUIDITY', priority: 3} },

            { 'increaseLiquidity': {title: 'ADD LIQUIDITY', priority: 3} },
            { 'increaseLiquidityV2': {title: 'ADD LIQUIDITY', priority: 3} },
        ],
        skip: false,
    },
    [kProgram.PUMPFUN_AMM]: {
        name: 'PUMPSWAP',
        knownInstructions: [
            { 'buy': {title: 'BUY', priority: 3} },
            { 'sell': {title: 'SELL', priority: 3} },
            { 'create_pool': {title: 'ADD LIQUIDITY', priority: 2} },
            // { 'deposit': {title: 'ADD LIQUIDITY', priority: 3} },
            { 'withdraw': {title: 'REMOVE LIQUIDITY', priority: 3} },
        ],
        customIdl: {
            path: 'src/idls/pumpfun_amm.json',
            type: 'anchorV1',
        },
        skip: false,
    },
    [kProgram.JUPITER_LIMIT_ORDERS]: {
        name: 'JUPITER',
        knownInstructions: [
            { 'initializeOrder': {title: 'LIMIT ORDER', priority: 2} },
            { 'cancelOrder': {title: 'CANCELED LIMIT ORDER', priority: 2} },
            // { 'preFlashFillOrder': {title: 'FILL LIMIT ORDER', priority: 2} },
            // { 'flashFillOrder': {title: 'FILL LIMIT ORDER', priority: 2} },
        ],
        skip: false,
    },
    [kProgram.GO_FUND_MEME]: {
        name: 'GO FUND MEME',
        knownInstructions: [
            // { 'any': {title: 'any', priority: 3} },
            { 'swap': {title: 'SWAP', priority: 3} },
        ],
        skip: false,
        customIdl: {
            path: 'src/idls/gofundmeme.json',
            type: 'anchor',
        },
    },
    [kProgram.SONIC_STAKING]: {
        name: 'SONIC STAKING',
        knownInstructions: [
            { 'walletStaking': {title: 'STAKE', priority: 1} },
            { 'walletStakingWithdraw': {title: 'UNSTAKE', priority: 1} }
        ],
        skip: false,
    },
    [kProgram.SEGA]: {
        name: 'SEGA',
        knownInstructions: [
            // { 'any': {title: 'UNDEFINED', priority: 1} },
            { 'swap_base_input': {title: 'SWAP', priority: 1} },
            { 'swap_base_output': {title: 'SWAP', priority: 1} },
            { 'deposit': {title: 'ADD LIQUIDITY', priority: 2} },
            { 'withdraw': {title: 'REMOVE LIQUIDITY', priority: 2} },
        ],
        skip: false,    
        customIdl: {
            path: 'src/idls/sega.json',
            type: 'anchorV1',
        },
    },
    [kProgram.TITAN_DEX]: {
        name: 'TITAN',
        knownInstructions: [
            { 'any': {title: 'SWAP', priority: 1} },
        ],
        skip: false,
        searchLogs: false,
    },
    [kProgram.KAMINO_LIMIT_ORDER]: {
        name: 'KAMINO',
        knownInstructions: [
            { 'createOrder': {title: 'LIMIT ORDER', priority: 1} },
            { 'closeOrderAndClaimTip': {title: 'CANCELED LIMIT ORDER', priority: 1} },
            { 'takeOrder': {title: 'FILLED LIMIT ORDER', priority: 1} },
            // { 'flashTakeOrderStart': {title: 'START FILLING LIMIT ORDER', priority: 1} },
            // { 'flashTakeOrderEnd': {title: 'END FILLING LIMIT ORDER', priority: 1} },
        ],
        skip: false,
        searchLogs: false,
    },
}

export const kSkipProgramIds = Object.keys(kPrograms).filter((key) => kPrograms[key].skip).map((key) => key);