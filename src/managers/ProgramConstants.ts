export enum kProgram {
    SOLANA = '11111111111111111111111111111111',
    TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    COMPUTE_BUDGET = 'ComputeBudget111111111111111111111111111111',
    
    RAYDIUM = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
    JUPITER = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
    SOL_INCINERATOR = 'F6fmDVCQfvnEq2KR8hhfZSEczfM9JK9fWbCsYJNbTGn7',
    TENSOR = 'TSWAPaqyCSx2KABk68Shruf4rp7CxcNi8hAsbdwmHbN',
    TENSOR_CNFT = 'TCMPhJdwDryooaGtiocG1u3xcYbRpiJzb283XfCZsDp',
    MAGIC_EDEN_AMM = 'mmm3XBJg5gk8XJxEKBvdgptZz6SgK4tXvn36sodowMc',
    MAGIC_EDEN_V2 = 'M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K',
    MAGIC_EDEN_V3 = 'M3mxk5W2tt27WGT7THox7PmgRDp4m6NEhL5xvxrBfS1',
    BUBBLEGUM = 'BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY',
}

export interface KnownInstruction {
    title: string, 
    priority: number, 
}

export const kPrograms: { [key: string]: {
    name?: string,
    knownInstructions: {[key: string]: KnownInstruction}[],
    skip?: boolean,
} } = {
    [kProgram.SOLANA]: {
        name: undefined,
        knownInstructions: [
            { 'transfer': {title: 'TRANSFER', priority: 100} },
        ],
        skip: false,
    },
    [kProgram.TOKEN_PROGRAM]: {
        name: 'TOKEN PROGRAM',
        knownInstructions: [
            { 'transferChecked': {title: 'TRANSFER', priority: 100} },
        ],
        skip: false,
    },
    [kProgram.COMPUTE_BUDGET]: {
        name: undefined,
        knownInstructions: [],
        skip: true,
    },
    [kProgram.RAYDIUM]: {
        name: 'RAYDIUM',
        knownInstructions: [
            { 'swapBaseIn': {title: 'SWAP', priority: 2} },
            { 'swapBaseOut': {title: 'SWAP', priority: 2} },
            { 'initialize': {title: 'ADD LIQUIDOTY', priority: 3} },
            { 'initialize2': {title: 'ADD LIQUIDOTY', priority: 3} },
        ],
        skip: false,
    },
    [kProgram.JUPITER]: {
        name: 'JUPITER',
        knownInstructions: [
            { 'routeWithTokenLedger': {title: 'SWAP', priority: 1} },
            { 'sharedAccountsRoute': {title: 'SWAP', priority: 1} },
            { 'route': {title: 'SWAP', priority: 1} },
            { 'exactOutRoute': {title: 'SWAP', priority: 1} },
            { 'sharedAccountsRouteWithTokenLedger': {title: 'SWAP', priority: 1} },
            { 'sharedAccountsExactOutRoute': {title: 'SWAP', priority: 1} },
            { 'claim': {title: 'CLAIM', priority: 5} },
            { 'claimToken': {title: 'CLAIM', priority: 5} },
        ],
        skip: false,
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
}

export const kSkipProgramIds = Object.keys(kPrograms).filter((key) => kPrograms[key].skip).map((key) => key);