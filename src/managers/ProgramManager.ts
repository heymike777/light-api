import { Program } from "../entities/Program";
import { getProgramIdl, IdlItem } from "@solanafm/explorer-kit-idls";
import { Chain } from "../services/solana/types";
import { checkIfInstructionParser, ParserOutput, ParserType, SolanaFMParser } from "@solanafm/explorer-kit";
import * as web3 from "@solana/web3.js";
import { ExplorerManager } from "../services/explorers/ExplorerManager";
import { Helpers } from "../services/helpers/Helpers";
import { KnownInstruction, kProgram, kPrograms, kSkipProgramIds } from "./constants/ProgramConstants";
import { SPL_ACCOUNT_COMPRESSION_PROGRAM_ID } from "@metaplex-foundation/mpl-bubblegum";
import { PublicKey } from "@solana/web3.js";
import { MetaplexManager } from "./MetaplexManager";
import { WalletManager } from "./WalletManager";
import { getTokenMetadata } from "@solana/spl-token";
import fs from "fs";
import { kSolAddress } from "../services/solana/Constants";
import { IWallet } from "../entities/Wallet";
import BN from "bn.js";
import { LogManager } from "./LogManager";

export type Ix = web3.ParsedInstruction | web3.PartiallyDecodedInstruction;

export interface ParsedIxData {
    output: ParserOutput, 
    programName?: string
}

export interface ParsedTx {
    title: string;
    // description?: TxDescription;
    assetId?: string;
    signature: string;
    walletsInvolved: string[];
    preBalances?: number[];
    postBalances?: number[];
    preTokenBalances?: web3.TokenBalance[];
    postTokenBalances?: web3.TokenBalance[];
    blockTime: number;
    accounts: string[];
    parsedInstructions?: ParsedIx[];
}

export interface ParsedIx {
    programId: string, 
    priority: number,
    program?: string, 
    title?: string, 
    description?: TxDescription,
    data?: ParserOutput,
    accountKeys: PublicKey[],
}

export interface TxDescription {
    plain: string;
    html: string;
    addresses?: string[];
}

export class ProgramManager {
    static programIds: string[] = [];
    static idls: Map<string, IdlItem> = new Map();
    static programNameCache: Map<string, string | undefined> = new Map();

    static async addProgram(programId: string, chain: Chain = Chain.SOLANA){
        try {
            if (this.programIds.indexOf(programId) == -1){
                this.programIds.push(programId);

                await Program.create({ programId, chain });
            }
        }
        catch (error){}
    }        

    static programsIdlFetchCounts: {[key: string]: number} = {};
    static async getIDL(programId: string): Promise<IdlItem | undefined>{
        const existingIdl = this.idls.get(programId);
        if (existingIdl){
            return existingIdl;
        }

        const SFMIdlItem = await getProgramIdl(programId);
        const idl = SFMIdlItem || undefined; 
        if (idl){
            this.idls.set(programId, idl);
        }
        return SFMIdlItem || undefined;    
    }

    static async parseParsedIx(programId: string, ixParsed: any | ParserOutput, previousIxs?: Ix[], accounts?: web3.PublicKey[], tx?: web3.ParsedTransactionWithMeta, instructions?: Ix[]): Promise<{description?: TxDescription}> {
        if (!ixParsed){
            return {};
        }
        LogManager.log('!parseParsedIx', 'programId:', programId);

        const ixType = ixParsed.name || ixParsed.type;
        
        let description: TxDescription | undefined;

        try {
            if (programId == kProgram.SOLANA){
                if (ixType == 'transfer' || ixType == 'transferWithSeed'){
                    const addresses = [ixParsed.info.source, ixParsed.info.destination];
                    description = {
                        plain: `{address0} transferred ${ixParsed.info.lamports / web3.LAMPORTS_PER_SOL} SOL to {address1}`,
                        html: `<a href="${ExplorerManager.getUrlToAddress(addresses[0])}">{address0}</a> transferred <b>${ixParsed.info.lamports / web3.LAMPORTS_PER_SOL} SOL</b> to <a href="${ExplorerManager.getUrlToAddress(addresses[1])}">{address1}</a>`,
                        addresses,
                    };
                }
            }
            else if (programId == kProgram.STAKE_PROGRAM){
                if (ixType == 'delegate'){
                    const createAccountIx = previousIxs?.find((ix) => ('parsed' in ix) && ix.programId.toBase58() == kProgram.SOLANA && ix.parsed.type == 'createAccount');
                    const lamports = createAccountIx && ('parsed' in createAccountIx) ? createAccountIx?.parsed.info.lamports : undefined;
                    const stakeAmountString = lamports ? `${lamports / web3.LAMPORTS_PER_SOL} SOL` : 'SOL';

                    const addresses = [ixParsed.info.stakeAuthority, ixParsed.info.voteAccount, ixParsed.info.stakeAccount];
                    description = {
                        plain: `{address0} staked ${stakeAmountString} with {address1}`,
                        html: `<a href="${ExplorerManager.getUrlToAddress(addresses[0])}">{address0}</a> staked ${stakeAmountString} with <a href="${ExplorerManager.getUrlToAddress(addresses[1])}">{address1}</a>`,
                        addresses,
                    };
                }
                else if (ixType == 'withdraw'){
                    const stakeAmountString = ixParsed.info.lamports ? `${ixParsed.info.lamports / web3.LAMPORTS_PER_SOL} SOL` : 'SOL';

                    const addresses = [ixParsed.info.destination, ixParsed.info.withdrawAuthority, ixParsed.info.stakeAccount];
                    description = {
                        plain: `{address0} unstaked ${stakeAmountString} from {address1}`,
                        html: `<a href="${ExplorerManager.getUrlToAddress(addresses[0])}">{address0}</a> unstaked ${stakeAmountString} from <a href="${ExplorerManager.getUrlToAddress(addresses[1])}">{address1}</a>`,
                        addresses,
                    };
                }
                else if (ixType == 'deactivate'){
                    const addresses = [ixParsed.info.stakeAuthority, ixParsed.info.stakeAccount];
                    description = {
                        plain: `{address0} deactivated stake account {address1}`,
                        html: `<a href="${ExplorerManager.getUrlToAddress(addresses[0])}">{address0}</a> deactivated stake account <a href="${ExplorerManager.getUrlToAddress(addresses[1])}">{address1}</a>`,
                        addresses,
                    };
                }
            }
            else if (programId == kProgram.TOKEN_PROGRAM){
                LogManager.log('!!!TOKEN_PROGRAM', 'ixParsed:', ixParsed, 'accounts:', accounts);
                if (ixType == 'transfer' || ixType == 'transferChecked'){
                    if (tx){
                        const sourceAccount = ixParsed.info?.source || accounts?.[0]?.toBase58();
                        const destinationAccount = ixParsed.info?.destination || accounts?.[2]?.toBase58();

                        const allAccounts = [...tx.meta?.preTokenBalances || [], ...tx.meta?.postTokenBalances || []];
                        const walletSort: {[key: string]: {owner?: string, mint: string}} = {};
                        for (const account of allAccounts) {
                            walletSort[tx.transaction.message.accountKeys[account.accountIndex].pubkey.toBase58()] = {
                                owner: account.owner,
                                mint: account.mint,
                            };
                        }

                        const sourceWalletAddress = walletSort[sourceAccount]?.owner || 'unknown';
                        const destinationWalletAddress = walletSort[destinationAccount]?.owner || 'unknown';
                        const tokenMint = ixParsed.info?.mint || walletSort[destinationAccount]?.mint || accounts?.[1]?.toBase58() || 'unknown';
                        const decimals = allAccounts.find((account) => account.mint == tokenMint && account.uiTokenAmount?.decimals)?.uiTokenAmount.decimals || 0;

                        let amount: string | undefined = undefined;
                        if (ixParsed.info?.tokenAmount?.uiAmountString != undefined && ixParsed.info?.tokenAmount?.uiAmountString != null){
                            amount = ixParsed.info.tokenAmount.uiAmountString;
                        }
                        else if (ixParsed.info?.amount != undefined && ixParsed.info?.amount != null){
                            const bnAmount = new BN(ixParsed.info.amount);
                            const bnDecimalsAmount = new BN(10 ** decimals);
                            const { div, mod } = bnAmount.divmod(bnDecimalsAmount);
                            amount = div.toString() + (mod.eqn(0) ? '' : '.' + mod.toString());
                        }
                        else if (ixParsed.data?.amount != undefined && ixParsed.data?.amount != null && ixParsed.data?.decimals != undefined && ixParsed.data?.decimals != null){
                            const bnAmount = new BN(ixParsed.data.amount);
                            const bnDecimalsAmount = new BN(10 ** decimals);
                            const { div, mod } = bnAmount.divmod(bnDecimalsAmount);
                            amount = div.toString() + (mod.eqn(0) ? '' : '.' + mod.toString());
                        }
                        else if (ixParsed.data?.data?.amount != undefined && ixParsed.data?.data?.amount != null){
                            const bnAmount = new BN(ixParsed.data.data.amount);
                            const bnDecimalsAmount = new BN(10 ** decimals);
                            const { div, mod } = bnAmount.divmod(bnDecimalsAmount);
                            amount = div.toString() + (mod.eqn(0) ? '' : '.' + mod.toString());
                        }

                        const addresses: string[] = [sourceWalletAddress, destinationWalletAddress, tokenMint];
                        console.log('addresses:', addresses);
                        description = {
                            plain: `{address0} transferred ${amount} {address2} to {address1}`,
                            html: `<a href="${ExplorerManager.getUrlToAddress(addresses[0])}">{address0}</a> transferred ${amount} <a href="${ExplorerManager.getUrlToAddress(addresses[2])}">{address2}</a> to <a href="${ExplorerManager.getUrlToAddress(addresses[1])}">{address1}</a>`,
                            addresses,
                        };
                    }
                }
            }
            else if (programId == kProgram.PUMPFUN){
                const walletAddress = accounts?.[6]?.toBase58();
                const tokenMint = accounts?.[2]?.toBase58();
                if (walletAddress && tokenMint){
                    const addresses = [walletAddress, tokenMint];
                    const meta = tx?.meta;
                    const preAmount = meta?.preTokenBalances?.find((balance) => balance.mint == tokenMint && balance.owner == walletAddress)?.uiTokenAmount.uiAmount || 0;
                    const postAmount = meta?.postTokenBalances?.find((balance) => balance.mint == tokenMint && balance.owner == walletAddress)?.uiTokenAmount.uiAmount || 0;
                    let amount = postAmount - preAmount;

                    if (ixType == 'buy') {
                        description = {
                            plain: `{address0} bought ${amount} {address1} on Pump Fun`,
                            html: `<a href="${ExplorerManager.getUrlToAddress(addresses[0])}">{address0}</a> bought ${amount} <a href="${ExplorerManager.getUrlToAddress(addresses[1])}">{address1}</a> on Pump Fun`,
                            addresses: addresses,
                        };    
                    }
                    else if (ixType == 'sell') {
                        amount = -amount;

                        description = {
                            plain: `{address0} sold ${amount} {address1} on Pump Fun`,
                            html: `<a href="${ExplorerManager.getUrlToAddress(addresses[0])}">{address0}</a> sold ${amount} <a href="${ExplorerManager.getUrlToAddress(addresses[1])}">{address1}</a> on Pump Fun`,
                            addresses: addresses,
                        };    
                    }
                }
            }
            else if (programId == kProgram.RAYDIUM){
                if (['swapBaseIn', 'swapBaseOut'].indexOf(ixParsed.name) != -1){
                    const walletAddress = 
                        accounts?.[17]?.toBase58() || // serum program == openbook
                        accounts?.[16]?.toBase58(); // serum program != openbook
                    if (walletAddress && tx?.meta){
                        const changes = this.findChangedTokenBalances(walletAddress, tx.meta, false);
                        LogManager.log('!changes:', changes);

                        if (changes.length > 0){
                            const tokenMint = changes[0].mint;
                            const amount = changes[0].uiAmountChange;

                            const addresses = [walletAddress, tokenMint];
                            description = {
                                plain: `{address0} ${amount>0?'bought':'sold'} ${Math.abs(amount)} {address1} on Raydium`,
                                html: `<a href="${ExplorerManager.getUrlToAddress(addresses[0])}">{address0}</a> ${amount>0?'bought':'sold'} ${Math.abs(amount)} <a href="${ExplorerManager.getUrlToAddress(addresses[1])}">{address1}</a> on Raydium`,
                                addresses: addresses,
                            };    
                        }
                    }    
                }
            }
            else if (programId == kProgram.JUPITER){
                if (['routeWithTokenLedger', 'sharedAccountsRoute', 'route', 'exactOutRoute', 'sharedAccountsRouteWithTokenLedger', 'sharedAccountsExactOutRoute'].indexOf(ixParsed.name) != -1){
                    const walletIndexMap: {[key: string]: number} = {
                        'exactOutRoute': 1,
                        'sharedAccountsExactOutRoute': 2,
                        'route': 1,
                        'sharedAccountsRoute': 2,//?
                        'routeWithTokenLedger': 1,//?
                        'sharedAccountsRouteWithTokenLedger': 2,//?
                    } 
                    const walletAddress = accounts?.[walletIndexMap[ixParsed.name]]?.toBase58();
                    if (walletAddress && tx?.meta){
                        const changes = this.findChangedTokenBalances(walletAddress, tx.meta, false);
                        if (changes.length > 0){
                            const tokenMint = changes[0].mint;
                            const amount = changes[0].uiAmountChange;

                            const addresses = [walletAddress, tokenMint];
                            description = {
                                plain: `{address0} ${amount>0?'bought':'sold'} ${Math.abs(amount)} {address1} on Jupiter`,
                                html: `<a href="${ExplorerManager.getUrlToAddress(addresses[0])}">{address0}</a> ${amount>0?'bought':'sold'} ${Math.abs(amount)} <a href="${ExplorerManager.getUrlToAddress(addresses[1])}">{address1}</a> on Jupiter`,
                                addresses: addresses,
                            };    
                        }
                    }    
                }
            }
            else if (programId == kProgram.JUPITER_Z){
                if (['fill'].indexOf(ixParsed.name) != -1){
                    
                    const walletAddress = accounts?.[0]?.toBase58();
                    if (walletAddress && tx?.meta){
                        const changes = this.findChangedTokenBalances(walletAddress, tx.meta, false);
                        if (changes.length > 0){
                            const tokenMint = changes[0].mint;
                            const amount = changes[0].uiAmountChange;

                            const addresses = [walletAddress, tokenMint];
                            description = {
                                plain: `{address0} ${amount>0?'bought':'sold'} ${Math.abs(amount)} {address1} on Jupiter Z`,
                                html: `<a href="${ExplorerManager.getUrlToAddress(addresses[0])}">{address0}</a> ${amount>0?'bought':'sold'} ${Math.abs(amount)} <a href="${ExplorerManager.getUrlToAddress(addresses[1])}">{address1}</a> on Jupiter Z`,
                                addresses: addresses,
                            };    
                        }
                    }    
                }
            }
            else if (programId == kProgram.TENSOR){
                LogManager.log('!!!TENSOR', 'ixParsed:', ixParsed, 'accounts:', accounts);
                if (ixType == 'sellNftTokenPool'){
                    const buyerWalletAddress = accounts?.[9]?.toBase58();
                    const sellerWalletAddress = accounts?.[10]?.toBase58();
                    const tokenMint = accounts?.[6]?.toBase58();
                    if (buyerWalletAddress && sellerWalletAddress && tokenMint){
                        const addresses = [buyerWalletAddress, sellerWalletAddress, tokenMint];
                        const solAmount = +ixParsed.data?.config?.startingPrice / web3.LAMPORTS_PER_SOL;

                        description = {
                            plain: `{address0} bought {address2} from {address1} for ${solAmount} SOL on Tensor`,
                            html: `<a href="${ExplorerManager.getUrlToAddress(addresses[0])}">{address0}</a> bought <a href="${ExplorerManager.getUrlToAddress(addresses[2])}">{address2}</a> from <a href="${ExplorerManager.getUrlToAddress(addresses[1])}">{address1}</a> for <b>${solAmount} SOL</b> on Tensor`,
                            addresses: addresses,
                        };    
                    }
                }
                else if (ixType == 'buyNft'){
                    const buyerWalletAddress = accounts?.[11]?.toBase58();
                    const sellerWalletAddress = accounts?.[9]?.toBase58();
                    const tokenMint = accounts?.[5]?.toBase58();
                    if (buyerWalletAddress && sellerWalletAddress && tokenMint){
                        const addresses = [buyerWalletAddress, sellerWalletAddress, tokenMint];
                        const solAmount = ixParsed.data?.minPrice ? +ixParsed.data?.minPrice / web3.LAMPORTS_PER_SOL : +ixParsed.data?.maxPrice / web3.LAMPORTS_PER_SOL;

                        description = {
                            plain: `{address0} bought {address2} from {address1} for ${solAmount} SOL on Tensor`,
                            html: `<a href="${ExplorerManager.getUrlToAddress(addresses[0])}">{address0}</a> bought <a href="${ExplorerManager.getUrlToAddress(addresses[2])}">{address2}</a> from <a href="${ExplorerManager.getUrlToAddress(addresses[1])}">{address1}</a> for <b>${solAmount} SOL</b> on Tensor`,
                            addresses: addresses,
                        };    
                    }
                }
                else if (ixType == 'sellNftTradePool'){
                    const buyerWalletAddress = accounts?.[8]?.toBase58();
                    const sellerWalletAddress = accounts?.[10]?.toBase58();
                    const tokenMint = accounts?.[6]?.toBase58();
                    if (buyerWalletAddress && sellerWalletAddress && tokenMint){
                        const addresses = [buyerWalletAddress, sellerWalletAddress, tokenMint];
                        const solAmount = ixParsed.data?.minPrice ? +ixParsed.data?.minPrice / web3.LAMPORTS_PER_SOL : +ixParsed.data?.maxPrice / web3.LAMPORTS_PER_SOL;

                        description = {
                            plain: `{address0} bought {address2} from {address1} for ${solAmount} SOL on Tensor`,
                            html: `<a href="${ExplorerManager.getUrlToAddress(addresses[0])}">{address0}</a> bought <a href="${ExplorerManager.getUrlToAddress(addresses[2])}">{address2}</a> from <a href="${ExplorerManager.getUrlToAddress(addresses[1])}">{address1}</a> for <b>${solAmount} SOL</b> on Tensor`,
                            addresses: addresses,
                        };    
                    }
                }
                else if (ixType == 'buySingleListing'){
                    const buyerWalletAddress = accounts?.[8]?.toBase58();
                    const sellerWalletAddress = accounts?.[7]?.toBase58();
                    const tokenMint = accounts?.[4]?.toBase58();
                    if (buyerWalletAddress && sellerWalletAddress && tokenMint){
                        const addresses = [buyerWalletAddress, sellerWalletAddress, tokenMint];
                        const solAmount = ixParsed.data?.minPrice ? +ixParsed.data?.minPrice / web3.LAMPORTS_PER_SOL : +ixParsed.data?.maxPrice / web3.LAMPORTS_PER_SOL;

                        description = {
                            plain: `{address0} bought {address2} from {address1} for ${solAmount} SOL on Tensor`,
                            html: `<a href="${ExplorerManager.getUrlToAddress(addresses[0])}">{address0}</a> bought <a href="${ExplorerManager.getUrlToAddress(addresses[2])}">{address2}</a> from <a href="${ExplorerManager.getUrlToAddress(addresses[1])}">{address1}</a> for <b>${solAmount} SOL</b> on Tensor`,
                            addresses: addresses,
                        };    
                    }
                }
                else if (ixType == 'list'){
                    const buyerWalletAddress = accounts?.[5]?.toBase58();
                    const tokenMint = accounts?.[2]?.toBase58();
                    if (buyerWalletAddress && tokenMint){
                        const addresses = [buyerWalletAddress, tokenMint];
                        const solAmount = +ixParsed.data?.price / web3.LAMPORTS_PER_SOL;

                        description = {
                            plain: `{address0} listed {address1} for ${solAmount} SOL on Tensor`,
                            html: `<a href="${ExplorerManager.getUrlToAddress(addresses[0])}">{address0}</a> listed <a href="${ExplorerManager.getUrlToAddress(addresses[1])}">{address1}</a> for <b>${solAmount} SOL</b> on Tensor`,
                            addresses: addresses,
                        };    
                    }
                }
                else if (ixType == 'delist'){
                    const buyerWalletAddress = accounts?.[5]?.toBase58();
                    const tokenMint = accounts?.[2]?.toBase58();
                    if (buyerWalletAddress && tokenMint){
                        const addresses = [buyerWalletAddress, tokenMint];

                        description = {
                            plain: `{address0} delisted {address1} on Tensor`,
                            html: `<a href="${ExplorerManager.getUrlToAddress(addresses[0])}">{address0}</a> delisted <a href="${ExplorerManager.getUrlToAddress(addresses[1])}">{address1}</a> on Tensor`,
                            addresses: addresses,
                        };    
                    }
                }
            }
            else if (programId == kProgram.TENSOR_CNFT){
                LogManager.log('!!!TENSOR_CNFT', 'ixParsed:', ixParsed, 'accounts:', accounts);
                if (ixType == 'buy'){
                    const sellIx = await this.findIx(instructions, kProgram.TENSOR_CNFT, 'tcompNoop');

                    const buyerWalletAddress = accounts?.[10]?.toBase58();
                    const tokenMint = sellIx?.ixData?.output?.data?.event?.taker?.['0']?.assetId;
                    if (buyerWalletAddress && tokenMint){
                        const addresses = [buyerWalletAddress, tokenMint];
                        const solAmount = +ixParsed.data?.maxAmount / web3.LAMPORTS_PER_SOL;

                        description = {
                            plain: `{address0} bought {address1} for ${solAmount} SOL on Tensor`,
                            html: `<a href="${ExplorerManager.getUrlToAddress(addresses[0])}">{address0}</a> bought <a href="${ExplorerManager.getUrlToAddress(addresses[1])}">{address1}</a> for <b>${solAmount} SOL</b> on Tensor`,
                            addresses: addresses,
                        };    
                    }
                }
                else if (ixType == 'list'){
                    const buyerWalletAddress = accounts?.[1]?.toBase58();
                    if (buyerWalletAddress){
                        const addresses = [buyerWalletAddress];
                        const solAmount = +ixParsed.data?.amount / web3.LAMPORTS_PER_SOL;

                        description = {
                            plain: `{address0} listed compressed NFT for ${solAmount} SOL on Tensor`,
                            html: `<a href="${ExplorerManager.getUrlToAddress(addresses[0])}">{address0}</a> listed compressed NFT for <b>${solAmount} SOL</b> on Tensor`,
                            addresses: addresses,
                        };    
                    }
                }
                else if (ixType == 'delist'){
                    const buyerWalletAddress = accounts?.[7]?.toBase58();
                    if (buyerWalletAddress){
                        const addresses = [buyerWalletAddress];

                        description = {
                            plain: `{address0} delisted compressed NFT on Tensor`,
                            html: `<a href="${ExplorerManager.getUrlToAddress(addresses[0])}">{address0}</a> delisted compressed NFT on Tensor`,
                            addresses: addresses,
                        };    
                    }
                }
            }
            else if (programId == kProgram.MAGIC_EDEN_AMM){
                LogManager.log('!!!MAGIC_EDEN_AMM', 'ixParsed:', ixParsed, 'accounts:', accounts);

                // { 'solFulfillBuy': {title: 'NFT SALE', priority: 3} },
                // { 'solMip1FulfillBuy': {title: 'NFT SALE', priority: 3} },
                // { 'solOcpFulfillBuy': {title: 'NFT SALE', priority: 3} },
                // { 'solExtFulfillBuy': {title: 'NFT SALE', priority: 3} },
                // { 'solMplCoreFulfillBuy': {title: 'NFT SALE', priority: 3} },
                // { 'solFulfillSell': {title: 'NFT SALE', priority: 3} },
                // { 'solMip1FulfillSell': {title: 'NFT SALE', priority: 3} },
                // { 'solOcpFulfillSell': {title: 'NFT SALE', priority: 3} },
                // { 'solExtFulfillSell': {title: 'NFT SALE', priority: 3} },
                // { 'solMplCoreFulfillSell': {title: 'NFT SALE', priority: 3} },

                if (ixType == 'solMip1FulfillBuy'){
                    const buyerWalletAddress = accounts?.[0]?.toBase58();
                    const sellerWalletAddress = accounts?.[1]?.toBase58();
                    const tokenMint = accounts?.[7]?.toBase58();
                    if (buyerWalletAddress && sellerWalletAddress && tokenMint){
                        const addresses = [buyerWalletAddress, sellerWalletAddress, tokenMint];
                        const solAmount = ixParsed.data?.args?.minPaymentAmount / web3.LAMPORTS_PER_SOL;

                        description = {
                            plain: `{address0} bought {address2} from {address1} for ${solAmount} SOL on Magic Eden`,
                            html: `<a href="${ExplorerManager.getUrlToAddress(addresses[0])}">{address0}</a> bought <a href="${ExplorerManager.getUrlToAddress(addresses[2])}">{address2}</a> from <a href="${ExplorerManager.getUrlToAddress(addresses[1])}">{address1}</a> for <b>${solAmount} SOL</b> on Magic Eden`,
                            addresses: addresses,
                        };    
                    }

                }
            }
            else if (programId == kProgram.MAGIC_EDEN_V2){
                LogManager.log('!!!MAGIC_EDEN_V2', 'ixParsed:', ixParsed, 'accounts:', accounts);
                if (ixType == 'buyV2'){
                    const walletAddress = accounts?.[0]?.toBase58();
                    const tokenMint = accounts?.[2]?.toBase58();
                    if (walletAddress && tokenMint){
                        const addresses = [walletAddress, tokenMint];
                        const solAmount = +ixParsed.data?.buyerPrice / web3.LAMPORTS_PER_SOL;

                        description = {
                            plain: `{address0} bought {address1} for ${solAmount} SOL on Magic Eden`,
                            html: `<a href="${ExplorerManager.getUrlToAddress(addresses[0])}">{address0}</a> bought <a href="${ExplorerManager.getUrlToAddress(addresses[1])}">{address1}</a> for <b>${solAmount} SOL</b> on Magic Eden`,
                            addresses: addresses,
                        };    
                    }
                }
            }
            else if (programId == kProgram.MAGIC_EDEN_V3){
                LogManager.log('!!!MAGIC_EDEN_V3', 'ixParsed:', ixParsed, 'accounts:', accounts);

                // { 'buyNow': {title: 'NFT SALE', priority: 3} },
                // { 'sell': {title: 'NFT LISTING', priority: 5} },
                if (ixType == 'buyNow'){
                    const buyerWalletAddress = accounts?.[0]?.toBase58();
                    const sellerWalletAddress = accounts?.[1]?.toBase58();
                    if (buyerWalletAddress && sellerWalletAddress){
                        const addresses = [buyerWalletAddress, sellerWalletAddress];
                        const solAmount = ixParsed.data?.args?.buyerPrice / web3.LAMPORTS_PER_SOL;

                        description = {
                            plain: `{address0} bought NFT from {address1} for ${solAmount} SOL on Magic Eden`,
                            html: `<a href="${ExplorerManager.getUrlToAddress(addresses[0])}">{address0}</a> bought NFT from <a href="${ExplorerManager.getUrlToAddress(addresses[1])}">{address1}</a> for <b>${solAmount} SOL</b> on Magic Eden`,
                            addresses: addresses,
                        };    
                    }

                }
            }
        }
        catch (error){
            LogManager.error('!catched parseParsedIx', error);
        }
        

        return {
            description,
        };
    }

    static async findIx(instructions: Ix[] | undefined, programId: string, name: string): Promise<{ix: Ix, ixData: ParsedIxData} | undefined> {
        if (!instructions){
            return undefined;
        }

        for (const instruction of instructions) {
            if ('parsed' in instruction){
                if (instruction.programId.toBase58() == programId){
                    // most likely this will never be used
                }
            }
            else {
                if (instruction.programId.toBase58() == programId){
                    const ixData = await ProgramManager.parseIx(programId, instruction.data);
                    LogManager.log('programId', programId, 'ixData?.output:', ixData?.output);
                    if (ixData?.output?.name == name){                        
                        return { ix: instruction, ixData };
                    }
                }

            }
        }

        return undefined;
    }

    static async parseIx(programId: string, ixData: string): Promise<ParsedIxData | undefined>{
        let parser: SolanaFMParser | undefined;
        let idl: IdlItem | undefined;

        let customIdl = kPrograms[programId]?.customIdl;
        if (customIdl){
            const customParser = this.setupCustomParser(programId, customIdl.path, customIdl.type);
            parser = customParser.parser;
            idl = customParser.idlItem;
        }
        else {
            idl = await this.getIDL(programId);
            if (idl){
                parser = new SolanaFMParser(idl, programId);
            }

        }

        if (!parser || !idl){
            return undefined;
        }

        const instructionParser = parser.createParser(ParserType.INSTRUCTION);
        if (instructionParser && checkIfInstructionParser(instructionParser)) {
            const output = instructionParser.parseInstructions(ixData);

            let programName: string | undefined = kPrograms[programId]?.name;
            if (!programName){
                programName = (idl.idl as any).name || undefined;
                programName = programName?.replaceAll('_', ' ');
                programName = programName?.toUpperCase();
            }

            return  { output, programName };
        }

        return undefined;
    }

    static async getProgramName(programId: string, connection: web3.Connection): Promise<string | undefined> {
        // Check cache first
        if (this.programNameCache.has(programId)) {
            return this.programNameCache.get(programId);
        }

        try {
            const publicKey = new web3.PublicKey(programId);
            const accountInfo = await connection.getAccountInfo(publicKey);

            let programName: string | undefined;
            if (accountInfo && accountInfo.data) {
                // The program name is typically stored in the first 32 bytes of the account data
                programName = accountInfo.data.slice(0, 32).toString().replace(/\0/g, '').trim() || undefined;
            }

            // Cache the result (even if it's undefined)
            this.programNameCache.set(programId, programName);
            return programName;
        } catch (error) {
            LogManager.error(`Error fetching program name for ${programId}:`, error);
            // Cache the error case as undefined
            this.programNameCache.set(programId, undefined);
            return undefined;
        }
    }

    static async parseTx(tx: web3.ParsedTransactionWithMeta): Promise<ParsedTx> {
        let parsedInstructions: ParsedIx[] = [];

        const walletsInvolved = WalletManager.getInvolvedWallets(tx);
        const instructions: Ix[] = [
            ...tx.transaction.message.instructions,
        ];
        if (tx.meta?.innerInstructions){
            for (const innerIx of tx.meta?.innerInstructions) {
                instructions.push(...innerIx.instructions)
            }
        }
        
        let ixIndex = 0;
        let previousIxs: Ix[] = [];
        for (const instruction of instructions) {
            const ixProgramId = instruction.programId.toBase58();
            if (kSkipProgramIds.indexOf(ixProgramId) != -1){
                continue;
            }

            if ('parsed' in instruction){
                LogManager.log('instruction', ixIndex++, 'ixProgramId:', ixProgramId, 'parsed', '=', instruction.parsed);

                const info = await this.parseParsedIx(ixProgramId, instruction.parsed, previousIxs, undefined, tx);
                
                let programName: string | undefined = kPrograms[ixProgramId]?.name;
                let ixTitle: string | undefined = instruction.parsed.type;
                const knownInstruction = this.findKnownInstruction(ixProgramId, ixTitle);
                ixTitle = knownInstruction ? knownInstruction.title : ixTitle;

                LogManager.log('!description1', info?.description);

                parsedInstructions.push({
                    programId: ixProgramId,
                    program: programName,
                    title: ixTitle,
                    description: info?.description,
                    priority: knownInstruction?.priority || 1000,
                    accountKeys: [],//TODO: do I have to fill them from instruction.parsed?...
                });
            }
            else {
                const ixData = await ProgramManager.parseIx(ixProgramId, instruction.data);
                LogManager.log('instruction', ixIndex++, 'ixProgramId:', ixProgramId, 'ixData', '=', ixData);

                const info = await this.parseParsedIx(ixProgramId, ixData?.output, previousIxs, instruction.accounts, tx, instructions);

                let ixTitle = ixData?.output?.name;
                const knownInstruction = this.findKnownInstruction(ixProgramId, ixTitle);
                ixTitle = knownInstruction ? knownInstruction.title : ixTitle;

                LogManager.log('!description2', info?.description);

                parsedInstructions.push({
                    programId: ixProgramId,
                    program: ixData?.programName || undefined,
                    title: ixTitle,
                    data: ixData?.output,
                    description: info?.description,
                    priority: knownInstruction?.priority || 1000,
                    accountKeys: instruction.accounts || [],
                });
            }

            previousIxs.push(instruction);
        }


        let txTitle = '';
        // let txDescription: TxDescription | undefined;
        let assetId: string | undefined;

        parsedInstructions = parsedInstructions.sort((a, b) => a.priority - b.priority);
        LogManager.log('parsedInstructions (sorted by priority)', JSON.stringify(parsedInstructions));

        for (const parsedInstruction of parsedInstructions) {
            if (parsedInstruction.program || parsedInstruction.title){
                if (txTitle.length > 0){
                    txTitle += ', ';
                }

                if (parsedInstruction.title){
                    txTitle += parsedInstruction.title;
                }

                if (parsedInstruction.title && parsedInstruction.program){
                    txTitle += ' on ';
                }

                if (parsedInstruction.program){
                    txTitle += parsedInstruction.program;
                }

                // txDescription = parsedInstruction.description;

                if (parsedInstruction.programId == kProgram.TENSOR_CNFT){
                    if (!assetId){
                        const ix2 = parsedInstructions.find((ix) => ix.programId == kProgram.TENSOR_CNFT && ix.data?.data?.event?.taker?.['0']?.assetId);
                        if (ix2){
                            assetId = ix2.data?.data?.event?.taker['0']?.assetId;
                            const taker = ix2.data?.data?.event?.taker['0']?.taker;
                        }
                    }

                    if (!assetId){
                        const ix3 = parsedInstructions.find((ix) => ix.programId == kProgram.TENSOR_CNFT && ix.data?.data?.event?.maker?.['0']?.assetId);
                        if (ix3){
                            assetId = ix3.data?.data?.event?.maker['0']?.assetId;
                            const maker = ix3.data?.data?.event?.maker['0']?.taker;
                        }
                    }
                }
                else if (parsedInstruction.programId == kProgram.MAGIC_EDEN_V3){
                    assetId = this.getAssetIdFromIxs(parsedInstructions);
                }

                if (!assetId){
                    assetId = this.getAssetIdFromIxs(parsedInstructions);
                }

                // I add only first instruction to the tx parsed title. 
                // if needed, can add more instructions to the title.
                break; 
            }
        }

        if (txTitle.length == 0){
            txTitle = 'TRANSCATION';
        }

        return {
            title: txTitle,
            // description: txDescription,
            assetId,
            signature: tx?.transaction?.signatures?.[0] || '',
            walletsInvolved,
            preTokenBalances: tx.meta?.preTokenBalances || undefined,
            postTokenBalances: tx.meta?.postTokenBalances || undefined,
            preBalances: tx.meta?.preBalances || undefined,
            postBalances: tx.meta?.postBalances || undefined,
            blockTime: tx.blockTime || Math.floor(Date.now() / 1000),
            accounts: tx.transaction.message.accountKeys.map((key) => key.pubkey.toBase58()),
            parsedInstructions: parsedInstructions,
        }
    }

    static findKnownInstruction(programId: string, title?: string): KnownInstruction | undefined {
        if (!title){
            return undefined;
        }

        const program = kPrograms[programId];
        if (program){
            for (const knownInstruction of program.knownInstructions){
                if (knownInstruction[title]){
                    return knownInstruction[title];
                }
            }
        }
    }

    static getAssetIdFromIxs(parsedInstructions: ParsedIx[]): string | undefined {
        const ix = parsedInstructions.find((ix) => ix.programId == SPL_ACCOUNT_COMPRESSION_PROGRAM_ID.toString());
        const treeAddress = ix?.accountKeys?.[0] || undefined;
        const leafIndex = this.findCompressedLeafIndex(parsedInstructions);

        if (!treeAddress || leafIndex == undefined){
            return undefined;
        }

        const assetId = MetaplexManager.fetchAssetIdByTreeAnfLeafIndex(treeAddress.toBase58(), leafIndex);
        return assetId;
    }

    static findCompressedLeafIndex(parsedInstructions: ParsedIx[]): number | undefined {
        for (const ix of parsedInstructions) {
            if (ix.programId == SPL_ACCOUNT_COMPRESSION_PROGRAM_ID.toString() && ix.data?.data?.index){
                return ix.data.data.index
            }
        }

        return undefined;
    }

    static setupCustomParser(programId: string, idlPath: string, idlType: "anchor" | "shank" | "kinobi"): { parser: SolanaFMParser, idlItem: IdlItem } {
        const jsonString = fs.readFileSync(idlPath, "utf8");
        const idlFile = JSON.parse(jsonString);
        
        const idlItem: IdlItem = {
            programId: programId,
            idl: idlFile,
            idlType: idlType,
        };
        
        const parser = new SolanaFMParser(idlItem, programId);
        return {parser, idlItem};
    }

    static findChangedTokenBalances(walletAddress: string, meta: web3.ParsedTransactionMeta, includeWsol = true): {mint: string, uiAmountChange: number, amountChange: BN}[] {
        const preBalances = meta.preTokenBalances || [];
        const postBalances = meta.postTokenBalances || [];

        const preBalancesMap: {[key: string]: web3.TokenBalance | undefined} = {};
        for (const balance of preBalances) {
            if (balance.owner == walletAddress){
                preBalancesMap[balance.mint] = balance;
            }
        }

        let changedBalances: {mint: string, uiAmountChange: number, amountChange: BN}[] = [];
        for (const postBalance of postBalances) {
            if (postBalance.owner == walletAddress){
                const preBalance = preBalancesMap[postBalance.mint];
                if (!preBalance || preBalance.uiTokenAmount.uiAmount != postBalance.uiTokenAmount.uiAmount){
                    const uiAmountChange = (postBalance.uiTokenAmount.uiAmount || 0) - (preBalance?.uiTokenAmount.uiAmount || 0);
                    if (uiAmountChange != 0){
                        const amountChange: BN = new BN(postBalance?.uiTokenAmount.amount || 0).sub(new BN(preBalance?.uiTokenAmount.amount || 0));

                        changedBalances.push({ mint: postBalance.mint, uiAmountChange: uiAmountChange, amountChange: amountChange });
                    }

                    

                    preBalancesMap[postBalance.mint] = undefined;
                }
                else if (preBalance && preBalance.uiTokenAmount.uiAmount == postBalance.uiTokenAmount.uiAmount){
                    preBalancesMap[postBalance.mint] = undefined;
                }
            }
        }

        for (const mint in preBalancesMap) {
            const balance = preBalancesMap[mint];
            if (balance && balance.uiTokenAmount.uiAmount && balance.uiTokenAmount.uiAmount != 0){
                changedBalances.push({ mint: balance.mint, uiAmountChange: balance.uiTokenAmount.uiAmount, amountChange: new BN(balance.uiTokenAmount.amount) });
            }
        }

        if (!includeWsol){
            changedBalances = changedBalances.filter((balance) => balance.mint != kSolAddress);
        }

        return changedBalances;
    }

    static findSolChange(walletAddress: string, tx: web3.ParsedTransactionWithMeta): BN | undefined {
        if (!tx.meta){
            return undefined;
        }

        const changes = this.findChangedTokenBalances(walletAddress, tx.meta, true);
        const wsolChange = changes.find((change) => change.mint == kSolAddress);
        if (wsolChange){
            return wsolChange.amountChange;
        }

        // tx.transaction.message.accountKeys[0].
        const index = tx.transaction.message.accountKeys.findIndex((key) => key.pubkey.toBase58() == walletAddress);

        if (index != undefined && tx.meta.preBalances && tx.meta.postBalances && tx.meta.preBalances.length > index && tx.meta.postBalances.length > index){
            return new BN(tx.meta.postBalances[index] - tx.meta.preBalances[index]);
        }

        return undefined;
    }


    static findTxDescription(parsedInstructions: ParsedIx[] | undefined, wallets: IWallet[]): TxDescription | undefined {
        LogManager.log('findTxDescription', 'wallets:', wallets.map((w) => w.walletAddress), 'parsedInstructions:', JSON.stringify(parsedInstructions));

        if (!parsedInstructions || parsedInstructions.length == 0){
            return undefined;
        }

        const priority = parsedInstructions[0].priority;
        parsedInstructions = parsedInstructions.filter((ix) => ix.priority == priority);

        let txDescription: TxDescription | undefined = undefined;

        for (const ix of parsedInstructions) {
            if (ix.title){
                let hasAccount = false;
                for (const accountKey of ix.description?.addresses || []) {
                    if (wallets.find((w) => w.walletAddress == accountKey)){
                        hasAccount = true;
                        break;
                    }
                }
                if (hasAccount){
                    LogManager.log('findTxDescription', 'found (1) ix:', ix);
                    txDescription = ix.description;
                    break;    
                }
            }
        }  

        if (!txDescription){
            for (const ix of parsedInstructions) {
                if (ix.title){
                    LogManager.log('findTxDescription', 'found (2) ix:', ix);

                    txDescription = ix.description;
                    break;
                }
            } 
        }
        return txDescription;
    }

}