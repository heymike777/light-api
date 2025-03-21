import { Program } from "../entities/Program";
import { checkIfInstructionParser, ParserOutput, ParserType, SolanaFMParser } from "@solanafm/explorer-kit";
import { getProgramIdl, IdlItem } from "@solanafm/explorer-kit-idls";
import { Chain } from "../services/solana/types";
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
import { kJupAddress, kSolAddress } from "../services/solana/Constants";
import { IWallet } from "../entities/Wallet";
import BN from "bn.js";
import { LogManager } from "./LogManager";
import { ISwap } from "../entities/payments/Swap";

export type Ix = (web3.ParsedInstruction | web3.PartiallyDecodedInstruction) & {ixParsed?: any | ParserOutput};

export interface ParsedIxData {
    output: ParserOutput, 
    programName?: string,
}

export interface ParsedSwapAmount {
    mint: string,
    amount: string,
    decimals: number,
}

export interface ParsedSwapMarket {
    address: string;
    pool1: string;
    pool1VaultAuthority?: string;
    pool2: string;
    pool2VaultAuthority?: string;
}

export interface ParsedSwap {
    signature?: string;
    from?: ParsedSwapAmount;
    to?: ParsedSwapAmount;
    market?: ParsedSwapMarket;
    bondingCurve?: {
        address: string;
    };
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
    swaps?: ParsedSwap[];
}

export interface ParsedIx {
    programId: string, 
    priority: number,
    program?: string, 
    title?: string, 
    description?: TxDescription,
    data?: ParserOutput,
    accountKeys: PublicKey[],
    swap?: ParsedSwap;
}

export interface TxDescription {
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

        const programsWithoutPublishedIdl = [
            'ZERor4xhbUycZ6gb9ntrhqscUcZmAbQDjEAtCf4hbZY',
        ];
        if (programsWithoutPublishedIdl.indexOf(programId) != -1){
            return undefined;
        }

        const SFMIdlItem = await getProgramIdl(programId);
        const idl = SFMIdlItem || undefined; 
        if (idl){
            this.idls.set(programId, idl);
        }
        return SFMIdlItem || undefined;    
    }

    static async parseParsedIx(
        chain: Chain,
        programId: string, 
        ixParsed: any | ParserOutput, 
        previousIxs?: Ix[], 
        accounts?: web3.PublicKey[], 
        tx?: web3.ParsedTransactionWithMeta, 
        instructions?: Ix[]
    ): Promise<{
        description?: TxDescription, 
        swap?: ParsedSwap,
        ixTitle?: string,
    }> {
        const programHasAnyKnownInstruction = kPrograms[programId]?.knownInstructions.find((knownInstruction) => knownInstruction['any']) != undefined;
        if (!ixParsed && !programHasAnyKnownInstruction){
            return {};
        }

        const ixType = ixParsed?.name || ixParsed?.type;
        let swap: ParsedSwap | undefined;
        let description: TxDescription | undefined;
        let ixTitle: string | undefined = undefined;
        const signature = tx?.transaction.signatures?.[0];

        try {
            if (programId == kProgram.SOLANA){
                if (ixType == 'transfer' || ixType == 'transferWithSeed'){
                    const addresses = [ixParsed.info.source, ixParsed.info.destination];
                    description = {
                        html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> transferred <b>${ixParsed.info.lamports / web3.LAMPORTS_PER_SOL} SOL</b> to <a href="${ExplorerManager.getUrlToAddress(chain, addresses[1])}">{address1}</a>`,
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
                        html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> staked ${stakeAmountString} with <a href="${ExplorerManager.getUrlToAddress(chain, addresses[1])}">{address1}</a>`,
                        addresses,
                    };
                }
                else if (ixType == 'withdraw'){
                    const stakeAmountString = ixParsed.info.lamports ? `${ixParsed.info.lamports / web3.LAMPORTS_PER_SOL} SOL` : 'SOL';

                    const addresses = [ixParsed.info.destination, ixParsed.info.withdrawAuthority, ixParsed.info.stakeAccount];
                    description = {
                        html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> unstaked ${stakeAmountString} from <a href="${ExplorerManager.getUrlToAddress(chain, addresses[1])}">{address1}</a>`,
                        addresses,
                    };
                }
                else if (ixType == 'deactivate'){
                    const addresses = [ixParsed.info.stakeAuthority, ixParsed.info.stakeAccount];
                    description = {
                        html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> deactivated stake account <a href="${ExplorerManager.getUrlToAddress(chain, addresses[1])}">{address1}</a>`,
                        addresses,
                    };
                }
            }
            else if (programId == kProgram.TOKEN_PROGRAM){
                LogManager.log('!!!TOKEN_PROGRAM', 'ixParsed:', ixParsed, 'accounts:', accounts);
                if (ixType == 'transfer' || ixType == 'transferChecked'){
                    if (tx){
                        const sourceAccountIndex = 0;
                        const destinationAccountIndex = ixType == 'transferChecked' ? 2 : 1;
                        const mintAccountIndex = ixType == 'transferChecked' ? 1 : undefined;

                        const sourceAccount = ixParsed.info?.source || accounts?.[sourceAccountIndex]?.toBase58();
                        const destinationAccount = ixParsed.info?.destination || accounts?.[destinationAccountIndex]?.toBase58();

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
                        const tokenMint = ixParsed.info?.mint || walletSort[sourceAccount]?.mint || walletSort[destinationAccount]?.mint || (mintAccountIndex && accounts?.[mintAccountIndex]?.toBase58()) || 'unknown';
                        const decimals = allAccounts.find((account) => account.mint == tokenMint && account.uiTokenAmount?.decimals)?.uiTokenAmount.decimals || 0;

                        let amount: string | undefined = undefined;
                        if (ixParsed.info?.tokenAmount?.uiAmountString != undefined && ixParsed.info?.tokenAmount?.uiAmountString != null){
                            amount = ixParsed.info.tokenAmount.uiAmountString;
                        }
                        else if (ixParsed.info?.amount != undefined && ixParsed.info?.amount != null){
                            const bnAmount = new BN(ixParsed.info.amount);
                            amount = Helpers.bnToUiAmount(bnAmount, decimals);
                        }
                        else if (ixParsed.data?.amount != undefined && ixParsed.data?.amount != null){
                            const bnAmount = new BN(ixParsed.data.amount);
                            amount = Helpers.bnToUiAmount(bnAmount, decimals);
                        }
                        else if (ixParsed.data?.data?.amount != undefined && ixParsed.data?.data?.amount != null){
                            const bnAmount = new BN(ixParsed.data.data.amount);
                            amount = Helpers.bnToUiAmount(bnAmount, decimals);
                        }

                        const addresses: string[] = [sourceWalletAddress, destinationWalletAddress, tokenMint];
                        LogManager.log('addresses:', addresses);
                        description = {
                            html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> transferred ${amount} <a href="${ExplorerManager.getUrlToAddress(chain, addresses[2])}">{address2}</a> to <a href="${ExplorerManager.getUrlToAddress(chain, addresses[1])}">{address1}</a>`,
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
                    const preTokenBalance = meta?.preTokenBalances?.find((balance) => balance.mint == tokenMint && balance.owner == walletAddress);
                    const postTokenBalance = meta?.postTokenBalances?.find((balance) => balance.mint == tokenMint && balance.owner == walletAddress);
                    let amount: BN = new BN(postTokenBalance?.uiTokenAmount.amount || '0').sub(new BN(preTokenBalance?.uiTokenAmount.uiAmount || '0'));
                    let uiAmount = (postTokenBalance?.uiTokenAmount.uiAmount || 0) - (preTokenBalance?.uiTokenAmount.uiAmount || 0);
                    let decimals = preTokenBalance?.uiTokenAmount.decimals || postTokenBalance?.uiTokenAmount.decimals || 0;

                    let swapLamports = 0;
                    const programFee = kPrograms[programId].fee;
                    if (programFee){
                        const feeAccountIndex = tx?.transaction.message.accountKeys.findIndex((accountKey: any) => accountKey.pubkey.equals(new PublicKey(programFee.account)));
                        let feeAmount = feeAccountIndex!=undefined ? (meta?.postBalances?.[feeAccountIndex] || 0) - (meta?.preBalances?.[feeAccountIndex] || 0) : 0;
                        swapLamports = feeAmount / programFee.amount;
                    }
                    const bondingCurveAddress = accounts?.[3]?.toBase58();
                    const bondingCurve = bondingCurveAddress ? { address: bondingCurveAddress } : undefined;
                    const solAmountString = swapLamports > 0 ? ` for ${swapLamports / web3.LAMPORTS_PER_SOL} SOL` : '';
                    
                    if (ixType == 'buy') {
                        description = {
                            html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> bought ${uiAmount} <a href="${ExplorerManager.getUrlToAddress(chain, addresses[1])}">{address1}</a>${solAmountString} on Pump Fun`,
                            addresses: addresses,
                        };    

                        swap = {
                            from: {
                                mint: kSolAddress,
                                amount: '' + swapLamports,
                                decimals: 9,
                            },
                            to: {
                                mint: tokenMint,
                                amount: amount.toString(),
                                decimals: decimals,
                            },
                            bondingCurve,
                            signature,
                        }
                    }
                    else if (ixType == 'sell') {
                        description = {
                            html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> sold ${-amount} <a href="${ExplorerManager.getUrlToAddress(chain, addresses[1])}">{address1}</a>${solAmountString} on Pump Fun`,
                            addresses: addresses,
                        };    

                        swap = {
                            from: {
                                mint: tokenMint,
                                amount: amount.muln(-1).toString(),
                                decimals: decimals,
                            },
                            to: {
                                mint: kSolAddress,
                                amount: '' + swapLamports,
                                decimals: 9,
                            },
                            bondingCurve,
                            signature,
                        }
                    }
                }
            }
            else if (programId == kProgram.RAYDIUM_AMM){
                if (['swapBaseIn', 'swapBaseOut'].indexOf(ixParsed.name) != -1){
                    const walletAddress = 
                        accounts?.[17]?.toBase58() || // serum program == openbook
                        accounts?.[16]?.toBase58(); // serum program != openbook
                    if (walletAddress && tx?.meta){
                        const changes = this.findChangedTokenBalances(walletAddress, tx, false);

                        if (changes.length > 0){
                            const tokenMint = changes[0].mint;
                            const amount = changes[0].uiAmountChange;

                            const addresses = [walletAddress, tokenMint];
                            description = {
                                html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> ${amount>0?'bought':'sold'} ${Math.abs(amount)} <a href="${ExplorerManager.getUrlToAddress(chain, addresses[1])}">{address1}</a> on Raydium`,
                                addresses: addresses,
                            };    
                        }
                    }    
                }
            }
            else if (programId == kProgram.RAYDIUM_CPMM){
                if (['swapBaseInput', 'swapBaseOutput'].indexOf(ixType) != -1){
                    const walletAddress = accounts?.[0]?.toBase58();
                    if (walletAddress && tx){
                        const market: ParsedSwapMarket = {
                            address: accounts?.[3]?.toBase58() || '',
                            pool1: accounts?.[6]?.toBase58() || '',
                            pool1VaultAuthority: accounts?.[1]?.toBase58() || '',
                            pool2: accounts?.[7]?.toBase58() || '',
                            pool2VaultAuthority: accounts?.[1]?.toBase58() || '',
                        }
                        swap = this.getParsedSwapFromTxByMarket(tx, market, true);
                        description = this.getSwapDescription(chain, swap, walletAddress, 'Raydium CPMM');    
                    }    
                }
                else if (['deposit'].indexOf(ixType) != -1){
                    const walletAddress = accounts?.[0]?.toBase58();
                    if (walletAddress){
                        const addresses = [walletAddress];
                        description = {
                            html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> added liquidity on Raydium CPMM`,
                            addresses: addresses,
                        }; 
                    }
                }
                else if (['withdraw'].indexOf(ixType) != -1){
                    const walletAddress = accounts?.[0]?.toBase58();
                    if (walletAddress){
                        const addresses = [walletAddress];
                        description = {
                            html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> removed liquidity on Raydium CPMM`,
                            addresses: addresses,
                        }; 
                    }
                }
            }
            else if (programId == kProgram.JUPITER){
                LogManager.log('!!!JUPITER', 'ixParsed:', ixParsed, 'accounts:', accounts);

                if ([
                    'route', 
                    'routeWithTokenLedger', 
                    'sharedAccountsRoute', 
                    'exactOutRoute', 
                    'sharedAccountsRouteWithTokenLedger', 
                    'sharedAccountsExactOutRoute',
                    'route_with_token_ledger', 
                    'shared_accounts_route', 
                    'exact_out_route', 
                    'shared_accounts_route_with_token_ledger', 
                    'shared_accounts_exact_out_route'
                ].indexOf(ixParsed.name) != -1){
                    const walletIndexMap: {[key: string]: number} = {
                        'route': 1,
                        'exactOutRoute': 1,
                        'routeWithTokenLedger': 1,//?
                        'sharedAccountsExactOutRoute': 2,
                        'sharedAccountsRoute': 2,//?
                        'sharedAccountsRouteWithTokenLedger': 2,//?
                        'exact_out_route': 1,
                        'route_with_token_ledger': 1,//?
                        'shared_accounts_exact_out_route': 2,
                        'shared_accounts_route': 2,//?
                        'shared_accounts_route_with_token_ledger': 2,//?
                    } 
                    const walletAddress = accounts?.[walletIndexMap[ixParsed.name]]?.toBase58();
                    LogManager.log('JUP_V6', 'walletAddress:', walletAddress);

                    if (walletAddress && tx?.meta){
                        const changes = this.findChangedTokenBalances(walletAddress, tx, false);
                        if (changes.length > 0){
                            const tokenMint = changes[0].mint;
                            const amount = changes[0].uiAmountChange;

                            const addresses = [walletAddress, tokenMint];
                            description = {
                                html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> ${amount>0?'bought':'sold'} ${Math.abs(amount)} <a href="${ExplorerManager.getUrlToAddress(chain, addresses[1])}">{address1}</a> on Jupiter`,
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
                        const changes = this.findChangedTokenBalances(walletAddress, tx, false);
                        if (changes.length > 0){
                            const tokenMint = changes[0].mint;
                            const amount = changes[0].uiAmountChange;

                            const addresses = [walletAddress, tokenMint];
                            description = {
                                html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> ${amount>0?'bought':'sold'} ${Math.abs(amount)} <a href="${ExplorerManager.getUrlToAddress(chain, addresses[1])}">{address1}</a> on Jupiter Z`,
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
                            html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> bought <a href="${ExplorerManager.getUrlToAddress(chain, addresses[2])}">{address2}</a> from <a href="${ExplorerManager.getUrlToAddress(chain, addresses[1])}">{address1}</a> for <b>${solAmount} SOL</b> on Tensor`,
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
                            html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> bought <a href="${ExplorerManager.getUrlToAddress(chain, addresses[2])}">{address2}</a> from <a href="${ExplorerManager.getUrlToAddress(chain, addresses[1])}">{address1}</a> for <b>${solAmount} SOL</b> on Tensor`,
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
                            html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> bought <a href="${ExplorerManager.getUrlToAddress(chain, addresses[2])}">{address2}</a> from <a href="${ExplorerManager.getUrlToAddress(chain, addresses[1])}">{address1}</a> for <b>${solAmount} SOL</b> on Tensor`,
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
                            html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> bought <a href="${ExplorerManager.getUrlToAddress(chain, addresses[2])}">{address2}</a> from <a href="${ExplorerManager.getUrlToAddress(chain, addresses[1])}">{address1}</a> for <b>${solAmount} SOL</b> on Tensor`,
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
                            html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> listed <a href="${ExplorerManager.getUrlToAddress(chain, addresses[1])}">{address1}</a> for <b>${solAmount} SOL</b> on Tensor`,
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
                            html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> delisted <a href="${ExplorerManager.getUrlToAddress(chain, addresses[1])}">{address1}</a> on Tensor`,
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
                            html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> bought <a href="${ExplorerManager.getUrlToAddress(chain, addresses[1])}">{address1}</a> for <b>${solAmount} SOL</b> on Tensor`,
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
                            html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> listed compressed NFT for <b>${solAmount} SOL</b> on Tensor`,
                            addresses: addresses,
                        };    
                    }
                }
                else if (ixType == 'delist'){
                    const buyerWalletAddress = accounts?.[7]?.toBase58();
                    if (buyerWalletAddress){
                        const addresses = [buyerWalletAddress];

                        description = {
                            html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> delisted compressed NFT on Tensor`,
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
                            html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> bought <a href="${ExplorerManager.getUrlToAddress(chain, addresses[2])}">{address2}</a> from <a href="${ExplorerManager.getUrlToAddress(chain, addresses[1])}">{address1}</a> for <b>${solAmount} SOL</b> on Magic Eden`,
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
                            html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> bought <a href="${ExplorerManager.getUrlToAddress(chain, addresses[1])}">{address1}</a> for <b>${solAmount} SOL</b> on Magic Eden`,
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
                            html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> bought NFT from <a href="${ExplorerManager.getUrlToAddress(chain, addresses[1])}">{address1}</a> for <b>${solAmount} SOL</b> on Magic Eden`,
                            addresses: addresses,
                        };    
                    }

                }
            }
            else if (programId == kProgram.JUP_DAO){
                if (['increaseLockedAmount', 'withdraw', 'toggleMaxLock'].indexOf(ixType) != -1){
                    if (ixType == 'increaseLockedAmount'){
                        const walletAddress = accounts?.[3]?.toBase58();
                        if (walletAddress){
                            const addresses = [walletAddress];
                            const jupAmount = (ixParsed.data?.amount || 0) / (10 ** 6);
    
                            description = {
                                html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> staked <b>${jupAmount} JUP</b> on JUP DAO`,
                                addresses: addresses,
                            };
                        }
                    }
                    else if (ixType == 'toggleMaxLock'){
                        const walletAddress = accounts?.[2]?.toBase58();
                        if (walletAddress){
                            const addresses = [walletAddress];
                            const isMaxLock = ixParsed.data?.isMaxLock || true;

                            if (!isMaxLock){
                                description = {
                                    html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> unstaked <b>JUP</b> on JUP DAO`,
                                    addresses: addresses,
                                };
                            }
                        }
                    }
                    else if (ixType == 'withdraw'){
                        const walletAddress = accounts?.[2]?.toBase58();
                        if (walletAddress){
                            const addresses = [walletAddress];

                            const jupPreBalance = tx?.meta?.preTokenBalances?.find((balance) => balance.mint == kJupAddress && balance.owner == walletAddress)?.uiTokenAmount.uiAmount || 0;
                            const jupPostBalance = tx?.meta?.postTokenBalances?.find((balance) => balance.mint == kJupAddress && balance.owner == walletAddress)?.uiTokenAmount.uiAmount || 0;
                            const jupAmount = jupPostBalance - jupPreBalance;
    
                            description = {
                                html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> withdraw <b>${jupAmount} JUP</b> from JUP DAO`,
                                addresses: addresses,
                            };
                        }
                    }
                }
            }
            else if (programId == kProgram.JUP_GOVERNANCE){
                if (['setVote'].indexOf(ixType) != -1){
                    const newVoteIx = previousIxs?.find((ix) => ix.programId.toBase58() == kProgram.JUP_GOVERNANCE && (ix.ixParsed?.name=='newVote' || ix.ixParsed?.type=='newVote'));
                    const walletAddress = newVoteIx?.ixParsed?.data?.voter || "unknown";
                    const addresses = [walletAddress];

                    const votingPower = (ixParsed?.data?.weight || 0) / (10 ** 6);
                    const votingPowerString = (votingPower && votingPower>0) ? ` with ${votingPower} voting power` : '';

                    description = {
                        html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> voted${votingPowerString} on JUP GOVERNANCE`,
                        addresses: addresses,
                    };
                }
            }
            else if (programId == kProgram.METEORA_DLMM){
                if (['swap', 'swapExactOut', 'swapWithPriceImpact'].indexOf(ixType) != -1){
                    const walletAddress = accounts?.[10]?.toBase58();
                    const market: ParsedSwapMarket = {
                        address: accounts?.[0]?.toBase58() || '',
                        pool1: accounts?.[2]?.toBase58() || '',
                        pool2: accounts?.[3]?.toBase58() || '',
                    }
                    swap = tx ? this.getParsedSwapFromTxByMarket(tx, market, true) : undefined;

                    description = this.getSwapDescription(chain, swap, walletAddress, 'Meteora DLMM');    
                }
                else if (['removeLiquidity', 'removeLiquidityByRange'].indexOf(ixType) != -1){
                    const walletAddress = accounts?.[11]?.toBase58();
                    if (walletAddress){
                        const addresses = [walletAddress];
                        description = {
                            html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> removed liquidity on Meteora`,
                            addresses: addresses,
                        }; 
                    }
                }
                else if (['addLiquidity', 'addLiquidityByWeight', 'addLiquidityByStrategy'].indexOf(ixType) != -1){
                    const walletAddress = accounts?.[11]?.toBase58();
                    if (walletAddress){
                        const addresses = [walletAddress];
                        description = {
                            html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> added liquidity on Meteora`,
                            addresses: addresses,
                        }; 
                    }                }
                else if (['addLiquidityByStrategyOneSide', 'addLiquidityOneSide', 'addLiquidityOneSidePrecise'].indexOf(ixType) != -1){
                    const walletAddress = accounts?.[8]?.toBase58();
                    if (walletAddress){
                        const addresses = [walletAddress];
                        description = {
                            html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> added liquidity on Meteora`,
                            addresses: addresses,
                        }; 
                    }                
                }
            }
            else if (programId == kProgram.METEORA_POOLS){
                if (['swap'].indexOf(ixType) != -1){
                    const walletAddress = accounts?.[12]?.toBase58();
                    const market: ParsedSwapMarket = {
                        address: accounts?.[0]?.toBase58() || '',
                        pool1: accounts?.[5]?.toBase58() || '',
                        pool1VaultAuthority: accounts?.[3]?.toBase58() || '',
                        pool2: accounts?.[6]?.toBase58() || '',
                        pool2VaultAuthority: accounts?.[4]?.toBase58() || '',
                    }
                    swap = tx ? this.getParsedSwapFromTxByMarket(tx, market, true) : undefined;
                    description = this.getSwapDescription(chain, swap, walletAddress, 'Meteora');    
                }
                else if (['removeLiquiditySingleSide', 'removeBalanceLiquidity'].indexOf(ixType) != -1){
                    let index = ixType == 'removeLiquiditySingleSide' ? 12 : 13;

                    const walletAddress = accounts?.[index]?.toBase58();
                    if (walletAddress){
                        const addresses = [walletAddress];
                        description = {
                            html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> removed liquidity on Meteora`,
                            addresses: addresses,
                        }; 
                    }
                }
                else if (['addImbalanceLiquidity', 'addBalanceLiquidity'].indexOf(ixType) != -1){
                    const walletAddress = accounts?.[13]?.toBase58();
                    if (walletAddress){
                        const addresses = [walletAddress];
                        description = {
                            html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> added liquidity on Meteora`,
                            addresses: addresses,
                        }; 
                    }                
                }
                else if (['bootstrapLiquidity'].indexOf(ixType) != -1){
                    const walletAddress = accounts?.[13]?.toBase58();
                    if (walletAddress){
                        const addresses = [walletAddress];
                        description = {
                            html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> bootstrapped liquidity on Meteora`,
                            addresses: addresses,
                        }; 
                    }                
                }
            }
            else if (programId == kProgram.ORCA){
                if (['swap'].indexOf(ixType) != -1){
                    const walletAddress = accounts?.[1]?.toBase58();
                    const market: ParsedSwapMarket = {
                        address: accounts?.[2]?.toBase58() || '',
                        pool1: accounts?.[4]?.toBase58() || '',
                        pool2: accounts?.[6]?.toBase58() || '',
                    }
                    swap = tx ? this.getParsedSwapFromTxByMarket(tx, market, true) : undefined;

                    description = this.getSwapDescription(chain, swap, walletAddress, 'Orca');    
                }
                else if (['swapV2'].indexOf(ixType) != -1){
                    const walletAddress = accounts?.[3]?.toBase58();
                    const market: ParsedSwapMarket = {
                        address: accounts?.[4]?.toBase58() || '',
                        pool1: accounts?.[8]?.toBase58() || '',
                        pool2: accounts?.[10]?.toBase58() || '',
                    }
                    swap = tx ? this.getParsedSwapFromTxByMarket(tx, market, true) : undefined;

                    description = this.getSwapDescription(chain, swap, walletAddress, 'Orca');    
                }
                else if (['twoHopSwap', 'twoHopSwapV2'].indexOf(ixType) != -1){
                    const index = ixType == 'twoHopSwap' ? 1 : 14;
                    const walletAddress = accounts?.[index]?.toBase58();
                    if (walletAddress){
                        const addresses = [walletAddress];
                        description = {
                            html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> swapped multiple tokens on Orca`,
                            addresses: addresses,
                        };  
                    }        
                }
                else if (['decreaseLiquidity', 'decreaseLiquidityV2'].indexOf(ixType) != -1){
                    const index = ixType == 'decreaseLiquidity' ? 2 : 4;
                    const walletAddress = accounts?.[index]?.toBase58();
                    if (walletAddress){
                        const addresses = [walletAddress];
                        description = {
                            html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> removed liquidity on Orca`,
                            addresses: addresses,
                        }; 
                    }
                }
                else if (['increaseLiquidity', 'increaseLiquidityV2'].indexOf(ixType) != -1){
                    const index = ixType == 'increaseLiquidity' ? 2 : 4;
                    const walletAddress = accounts?.[index]?.toBase58();
                    if (walletAddress){
                        const addresses = [walletAddress];
                        description = {
                            html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> added liquidity on Orca`,
                            addresses: addresses,
                        }; 
                    }                
                }
            }
            else if (programId == kProgram.JUPITER_LIMIT_ORDERS){
                if (['initializeOrder'].indexOf(ixType) != -1){
                    const walletAddress = accounts?.[1]?.toBase58();
                    const mint1 = accounts?.[7]?.toBase58() || '';
                    const mint2 = accounts?.[8]?.toBase58() || '';

                    const bnAmount1 = new BN(ixParsed.data.params.makingAmount);
                    const decimals1 = tx?.meta?.preTokenBalances?.find((balance) => balance.mint == mint1)?.uiTokenAmount.decimals || tx?.meta?.postTokenBalances?.find((balance) => balance.mint == mint1)?.uiTokenAmount.decimals;
                    const uiAmount1 = Helpers.bnToUiAmount(bnAmount1, decimals1 || 0);

                    const bnAmount2 = new BN(ixParsed.data.params.takingAmount);
                    const decimals2 = tx?.meta?.preTokenBalances?.find((balance) => balance.mint == mint2)?.uiTokenAmount.decimals || tx?.meta?.postTokenBalances?.find((balance) => balance.mint == mint2)?.uiTokenAmount.decimals;
                    const uiAmount2 = Helpers.bnToUiAmount(bnAmount2, decimals2 || 0);

                    if (walletAddress){
                        const addresses = [walletAddress, mint1, mint2];
                        description = {
                            html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> placed a limit order to swap ${uiAmount1} <a href="${ExplorerManager.getUrlToAddress(chain, addresses[1])}">{address1}</a> to ${uiAmount2} <a href="${ExplorerManager.getUrlToAddress(chain, addresses[2])}">{address2}</a> on Jupiter`,
                            addresses: addresses,
                        }; 
                    }
                }
                else if (['cancelOrder'].indexOf(ixType) != -1){
                    const walletAddress = accounts?.[1]?.toBase58();
                    if (walletAddress){
                        const addresses = [walletAddress];
                        description = {
                            html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> canceled a limit order on Jupiter`,
                            addresses: addresses,
                        }; 
                    }
                }
            }
            else if (programId == kProgram.GO_FUND_MEME){
                if (tx){
                    try {
                        const logs = this.findTxLogs(tx, 'SWAP_SUMMARY');
                        if (logs.length > 0){
                            const swapSummaryStr = logs[0].replace('Program log: SWAP_SUMMARY-', '');
                            const swapSummary = JSON.parse(swapSummaryStr);

                            // swapSummary: {
                            //     direction: 'buy',
                            //     sol_amount_change: -0.01,
                            //     token_amount_change: 6781595.1781,
                            //     price: 1.4745793190801608e-9,
                            //     total_sol_raised: 38.644135716,
                            //     target_sol: 70,
                            //     pool_address: 'E4haRA2e4zx8uSxC8cFSKFZANkpZk93S8uoixLv5fWxK',
                            //     user_wallet_address: '9Xt9Zj9HoAh13MpoB6hmY9UZz37L4Jabtyn8zE7AAsL',
                            //     mint_address: 'xeSu4xi6Eno4ZpyDRdFC23va9eXteK2QUCVXqTUWGFM'
                            //   }

                            ixTitle = 'SWAP';

                            const walletAddress = swapSummary.user_wallet_address;
                            const mint = swapSummary.mint_address;
                            const solAmount = Math.abs(swapSummary.sol_amount_change);
                            const tokenAmount = Math.abs(swapSummary.token_amount_change);
                            const price = swapSummary.price;

                            //TODO: swap = ... 

                            const addresses = [walletAddress, mint];
                            description = {
                                html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> ${swapSummary.direction == 'buy' ? 'bought' : 'sold'} ${tokenAmount} <a href="${ExplorerManager.getUrlToAddress(chain, addresses[1])}">{address1}</a> for ${solAmount} SOL on GoFundMeme`,
                                addresses: addresses,
                            };

                        }
                    }
                    catch (error){}
                }

            }
            else if (programId == kProgram.PUMPFUN_AMM){
                LogManager.log('!!!PUMPFUNAPP', 'ixType:', ixType, 'ixParsed:', ixParsed, 'accounts:', accounts);
                if (['buy', 'sell'].indexOf(ixType) != -1){
                    const walletAddress = accounts?.[1]?.toBase58();
                    const market: ParsedSwapMarket = {
                        address: accounts?.[0]?.toBase58() || '',
                        pool1: accounts?.[7]?.toBase58() || '',
                        pool2: accounts?.[8]?.toBase58() || '',
                    }
                    swap = tx ? this.getParsedSwapFromTxByMarket(tx, market, true) : undefined;
                    description = this.getSwapDescription(chain, swap, walletAddress, 'PumpSwap');    
                }
                // else if (['create_pool'].indexOf(ixType) != -1){
                //     const walletAddress = accounts?.[11]?.toBase58();
                //     if (walletAddress){
                //         const addresses = [walletAddress];
                //         description = {
                //             html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> created a token on PumpSwap`,
                //             addresses: addresses,
                //         }; 
                //     }
                // }
                else if (['withdraw'].indexOf(ixType) != -1){
                    const walletAddress = accounts?.[2]?.toBase58();
                    if (walletAddress){
                        const addresses = [walletAddress];
                        description = {
                            html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> removed liquidity on PumpSwap`,
                            addresses: addresses,
                        }; 
                    }
                }
                else if (['create_pool'].indexOf(ixType) != -1){
                    const walletAddress = accounts?.[2]?.toBase58();
                    if (walletAddress){
                        const addresses = [walletAddress];
                        description = {
                            html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> added liquidity on PumpSwap`,
                            addresses: addresses,
                        }; 
                    }                
                }

            }
            else if (programId == kProgram.SONIC_STAKING){
                if (['walletStaking'].indexOf(ixType) != -1){
                    const stakingAmountString: string | undefined = ixParsed.data?.params?.stakingAmount;
                    let stakeAmountString: string | undefined = undefined;
                    if (stakingAmountString){
                        const stakingAmount = new BN(stakingAmountString || '0');
                        stakeAmountString = Helpers.bnToUiAmount(stakingAmount, 9); 
                    }

                    const walletAddress = accounts?.[2]?.toBase58() || 'unknown';
                    const tokenMint = accounts?.[4]?.toBase58() || 'unknown';

                    const addresses = [walletAddress, tokenMint];
                    description = {
                        html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> staked ${stakeAmountString} <a href="${ExplorerManager.getUrlToAddress(chain, addresses[1])}">{address1}</a>`,
                        addresses,
                    };
                }
                else if (['walletStakingWithdraw'].indexOf(ixType) != -1){
                    const walletAddress = accounts?.[2]?.toBase58() || 'unknown';
                    const tokenMint = accounts?.[4]?.toBase58() || 'unknown';

                    const addresses = [walletAddress, tokenMint];
                    description = {
                        html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> unstaked <a href="${ExplorerManager.getUrlToAddress(chain, addresses[1])}">{address1}</a>`,
                        addresses,
                    };
                }
            }
            else if (programId == kProgram.SEGA){

            }

        }
        catch (error){
            LogManager.error('!catched parseParsedIx', error);
        }

        // LogManager.forceLog('swap:', swap);
    
        return {
            description,
            swap,
            ixTitle,
        };
    }

    // shouldRevert == true, when I get swap from ix directly, by market address and pool1 & pool2
    // shouldRevert == false, when I get swap from tx, by wallet address
    static getParsedSwapFromTxByMarket(tx: web3.ParsedTransactionWithMeta, market: ParsedSwapMarket, shouldRevert = true): ParsedSwap | undefined {
        let swap: ParsedSwap | undefined = undefined;
        
        let tokenBalanceChanges: {
            address: string;
            amount: BN;
            decimals: number;
        }[] = [];

        for (const tokenBalance of tx.meta?.postTokenBalances || []) {
            if (
                tokenBalance.owner == market.address || 
                (market.pool1VaultAuthority && tokenBalance.owner == market.pool1VaultAuthority) || 
                (market.pool2VaultAuthority && tokenBalance.owner == market.pool2VaultAuthority)
            ){
                const existing = tokenBalanceChanges.find((change) => change.address == tokenBalance.mint);

                if (existing){
                    existing.amount = existing.amount.add(new BN(tokenBalance.uiTokenAmount.amount));
                }
                else {
                    tokenBalanceChanges.push({
                        address: tokenBalance.mint,
                        amount: new BN(tokenBalance.uiTokenAmount.amount),
                        decimals: tokenBalance.uiTokenAmount.decimals,
                    });
                }
            }
        }

        for (const tokenBalance of tx.meta?.preTokenBalances || []) {
            if (
                tokenBalance.owner == market.address || 
                (market.pool1VaultAuthority && tokenBalance.owner == market.pool1VaultAuthority) || 
                (market.pool2VaultAuthority && tokenBalance.owner == market.pool2VaultAuthority)
            ){
                const existing = tokenBalanceChanges.find((change) => change.address == tokenBalance.mint);

                if (existing){
                    existing.amount = existing.amount.sub(new BN(tokenBalance.uiTokenAmount.amount));
                }
                else {
                    tokenBalanceChanges.push({
                        address: tokenBalance.mint,
                        amount: new BN(tokenBalance.uiTokenAmount.amount).muln(-1),
                        decimals: tokenBalance.uiTokenAmount.decimals,
                    });
                }
            }
        }

        // filter zero balance changes
        tokenBalanceChanges = tokenBalanceChanges.filter((change) => !change.amount.eqn(0));

        // for (const tmp of tokenBalanceChanges) {
        //     console.log('!balanceChange:', tmp.address, tmp.amount.toNumber() / (10 ** tmp.decimals), 'market:', market);
        // }

        const positive = tokenBalanceChanges.filter((change) => change.amount.gt(new BN(0)));
        const negative = tokenBalanceChanges.filter((change) => change.amount.lt(new BN(0)));

        // if (positive.length != 1 || negative.length != 1){
        //     LogManager.error('!unexpected positive or negative length:', positive.length, negative.length, 'signature:', tx.transaction.signatures[0]);
        //     return undefined;
        // }

        const from = negative && negative.length>0 ? {
            mint: negative[0].address,
            amount: negative[0].amount.muln(-1).toString(),
            decimals: negative[0].decimals,
        } : undefined;
        const to = positive && positive.length>0 ? {
            mint: positive[0].address,
            amount: positive[0].amount.toString(),
            decimals: positive[0].decimals,
        } : undefined;

        swap = {
            signature: tx?.transaction.signatures?.[0],
            from: shouldRevert ? to : from,
            to: shouldRevert ? from : to,
        }

        return swap;
    }

    // static getParsedSwapFromTx(tx: web3.ParsedTransactionWithMeta, walletAddress: string): ParsedSwap | undefined {
    //     let swap: ParsedSwap | undefined = undefined;

    //     const publicKey = new PublicKey(walletAddress);
    //     const accountIndex = tx.transaction.message.accountKeys.findIndex((accountKey: web3.ParsedMessageAccount) => accountKey.pubkey.equals(publicKey));
    //     const nativeBalanceChange = (tx.meta?.postBalances[accountIndex] || 0) - (tx.meta?.preBalances[accountIndex] || 0);

    //     let tokenBalanceChanges: {
    //         address: string;
    //         amount: BN;
    //         decimals: number;
    //     }[] = [];

    //     for (const tokenBalance of tx.meta?.postTokenBalances || []) {
    //         if (tokenBalance.owner == walletAddress){
    //             const existing = tokenBalanceChanges.find((change) => change.address == tokenBalance.mint);

    //             if (existing){
    //                 existing.amount = existing.amount.add(new BN(tokenBalance.uiTokenAmount.amount));
    //             }
    //             else {
    //                 tokenBalanceChanges.push({
    //                     address: tokenBalance.mint,
    //                     amount: new BN(tokenBalance.uiTokenAmount.amount),
    //                     decimals: tokenBalance.uiTokenAmount.decimals,
    //                 });
    //             }
    //         }
    //     }

    //     for (const tokenBalance of tx.meta?.preTokenBalances || []) {
    //         if (tokenBalance.owner == walletAddress){
    //             const existing = tokenBalanceChanges.find((change) => change.address == tokenBalance.mint);

    //             if (existing){
    //                 existing.amount = existing.amount.sub(new BN(tokenBalance.uiTokenAmount.amount));
    //             }
    //             else {
    //                 tokenBalanceChanges.push({
    //                     address: tokenBalance.mint,
    //                     amount: new BN(tokenBalance.uiTokenAmount.amount).muln(-1),
    //                     decimals: tokenBalance.uiTokenAmount.decimals,
    //                 });
    //             }
    //         }
    //     }

    //     const wsolBalanceChange = tokenBalanceChanges.find((change) => change.address == kSolAddress);
    //     if (wsolBalanceChange){
    //         // It means that swap was made through WSOL. 
    //         // And amounts will be correct (not including gas fee, priority fee, etc). 
    //         // So this is perfect.
    //     }
    //     else {
    //         // Add wsol balance change = native SOL balance change. 
    //         // It will include gas fee, priority fee, etc. 
    //         // So not the most accurate values. But we can ignore it for now.

    //         const countPositive = tokenBalanceChanges.filter((change) => change.amount.gt(new BN(0))).length;
    //         const countNegative = tokenBalanceChanges.filter((change) => change.amount.lt(new BN(0))).length;

    //         if (countPositive == 1 && countNegative == 1 && nativeBalanceChange <= 0 && nativeBalanceChange >= -1000000){
    //             // native balance change is just gas fee. don't add it
    //         }
    //         else {
    //             tokenBalanceChanges.push({
    //                 address: kSolAddress,
    //                 amount: new BN(nativeBalanceChange),
    //                 decimals: 9,
    //             });
    //         }
    //     }

    //     // filter zero balance changes
    //     tokenBalanceChanges = tokenBalanceChanges.filter((change) => !change.amount.eqn(0));

    //     for (const tmp of tokenBalanceChanges) {
    //         console.log('!balanceChange:', tmp.address, tmp.amount.toNumber() / (10 ** tmp.decimals));
    //     }

    //     const positive = tokenBalanceChanges.filter((change) => change.amount.gt(new BN(0)));
    //     const negative = tokenBalanceChanges.filter((change) => change.amount.lt(new BN(0)));

    //     if (positive.length != 1 || negative.length != 1){
    //         LogManager.error('!unexpected positive or negative length:', positive.length, negative.length, 'signature:', tx.transaction.signatures[0]);
    //         return undefined;
    //     }

    //     swap = {
    //         signature: tx?.transaction.signatures?.[0],
    //         from: {
    //             mint: negative[0].address,
    //             amount: negative[0].amount.muln(-1).toString(),
    //             decimals: negative[0].decimals,
    //         },
    //         to: {
    //             mint: positive[0].address,
    //             amount: positive[0].amount.toString(),
    //             decimals: positive[0].decimals,
    //         }
    //     }

    //     return swap;
    // }


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
        try {
            if (kPrograms[programId]?.skipIdl){
                return undefined;
            }

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
                LogManager.log('parseIx', 'programId:', programId, 'ixData:', ixData);
                const output = instructionParser.parseInstructions(ixData);
                LogManager.log('parseIx', 'programId:', programId, 'ixData:', ixData, 'output:', output);


                let programName: string | undefined = kPrograms[programId]?.name;
                if (!programName){
                    programName = (idl.idl as any).name || undefined;
                    programName = programName?.replaceAll('_', ' ');
                    programName = programName?.toUpperCase();
                }

                return  { output, programName };
            }
        }
        catch (error){
            // LogManager.error('!catched parseIx', error);
        }

        return undefined;
    }

    static async parseTx(chain: Chain, tx: web3.ParsedTransactionWithMeta): Promise<ParsedTx> {
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

        // if (tx.meta?.logMessages){
        //     for (const log of tx.meta?.logMessages) {
        //         console.log('log:', log);
        //     }    
        // }
        
        let ixIndex = 0;
        let previousIxs: Ix[] = [];
        for (const instruction of instructions) {
            const ixProgramId = instruction.programId.toBase58();
            if (kSkipProgramIds.indexOf(ixProgramId) != -1){
                continue;
            }

            if ('parsed' in instruction){
                LogManager.log('instruction', ixIndex++, 'ixProgramId:', ixProgramId, 'parsed', '=', instruction.parsed);
                instruction.ixParsed = instruction.parsed;
                const info = await this.parseParsedIx(chain, ixProgramId, instruction.parsed, previousIxs, undefined, tx);
                
                let programName: string | undefined = kPrograms[ixProgramId]?.name;
                let ixTitle: string | undefined = instruction.parsed.type;
                const knownInstruction = this.findKnownInstruction(ixProgramId, ixTitle);
                ixTitle = info.ixTitle || knownInstruction?.title || ixTitle;

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
                instruction.ixParsed = ixData?.output;
                LogManager.log('!!!!instruction', ixIndex++, 'ixProgramId:', ixProgramId, 'ixData', '=', ixData, 'instruction.data:', instruction.data);

                const info = await this.parseParsedIx(chain, ixProgramId, ixData?.output, previousIxs, instruction.accounts, tx, instructions);

                let ixTitle = ixData?.output?.name;
                const programLogs = tx.meta?.logMessages?.join('\n');
                const knownInstruction = this.findKnownInstruction(ixProgramId, ixTitle, programLogs);
                ixTitle = info.ixTitle || knownInstruction?.title || ixTitle;
                LogManager.log('!description2', info?.description);

                parsedInstructions.push({
                    programId: ixProgramId,
                    program: ixData?.programName || undefined,
                    title: ixTitle,
                    data: ixData?.output,
                    description: info?.description,
                    priority: knownInstruction?.priority || 1000,
                    accountKeys: instruction.accounts || [],
                    swap: info.swap,
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

                const programName = parsedInstruction.program || this.findProgramName(parsedInstruction.programId);

                if (programName){
                    if (parsedInstruction.title){
                        txTitle += ' on ';
                    }

                    txTitle += programName;
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
                    assetId = this.getAssetIdFromIxs(chain, parsedInstructions);
                }

                if (!assetId){
                    assetId = this.getAssetIdFromIxs(chain, parsedInstructions);
                }

                // I add only first instruction to the tx parsed title. 
                // if needed, can add more instructions to the title.
                break; 
            }
        }

        let swaps: ParsedSwap[] | undefined = undefined;
        for (const parsedIx of parsedInstructions) {
            if (parsedIx.swap){
                if (!swaps) { swaps = []; }
                swaps.push(parsedIx.swap);
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
            swaps,
        }
    }

    static findKnownInstruction(programId: string, title?: string, programLogs?: string): KnownInstruction | undefined {
        const program = kPrograms[programId];
        if (program){
            for (const knownInstruction of program.knownInstructions){
                if (title && knownInstruction[title]){
                    return knownInstruction[title];
                }
                else if (knownInstruction['any']){
                    return knownInstruction['any'];
                }
                else if (program.searchLogs && programLogs){
                    for (const key in knownInstruction) {
                        if (Object.prototype.hasOwnProperty.call(knownInstruction, key)) {
                            const value = knownInstruction[key];
                            if (programLogs.includes(key)){
                                return value;
                            }
                        }
                    }
                }
            }
        }
    }

    static getAssetIdFromIxs(chain: Chain, parsedInstructions: ParsedIx[]): string | undefined {
        const ix = parsedInstructions.find((ix) => ix.programId == SPL_ACCOUNT_COMPRESSION_PROGRAM_ID.toString());
        const treeAddress = ix?.accountKeys?.[0] || undefined;
        const leafIndex = this.findCompressedLeafIndex(parsedInstructions);

        if (!treeAddress || leafIndex == undefined){
            return undefined;
        }

        const assetId = MetaplexManager.fetchAssetIdByTreeAnfLeafIndex(chain, treeAddress.toBase58(), leafIndex);
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

    static setupCustomParser(programId: string, idlPath: string, idlType: "anchor" | "anchorV1" | "shank" | "kinobi"): { parser: SolanaFMParser, idlItem: IdlItem } {
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

    static findChangedTokenBalances(walletAddress: string, tx: web3.ParsedTransactionWithMeta, includeWsol = true): {mint: string, uiAmountChange: number, amountChange: BN}[] {
        const changedBalances: {mint: string, uiAmountChange: number, amountChange: BN}[] = [];
        const swap = this.getParsedSwapFromTxByMarket(tx, {address: walletAddress, pool1: '', pool2: ''}, false);
        if (swap){
            if (swap.from){
                if (swap.from.mint != kSolAddress || includeWsol){
                    changedBalances.push({
                        mint: swap.from.mint,
                        uiAmountChange: - +Helpers.bnToUiAmount(new BN(swap.from.amount), swap.from.decimals),
                        amountChange: new BN(swap.from.amount).muln(-1),
                    });
                }
            }

            if (swap.to){
                if (swap.to.mint != kSolAddress || includeWsol){
                    changedBalances.push({
                        mint: swap.to.mint,
                        uiAmountChange: +Helpers.bnToUiAmount(new BN(swap.to.amount), swap.to.decimals),
                        amountChange: new BN(swap.to.amount),
                    });
                }
            }
        }

        return changedBalances;
    }

    static findSolChange(walletAddress: string, tx: web3.ParsedTransactionWithMeta): BN | undefined {
        if (!tx.meta){
            return undefined;
        }

        const changes = this.findChangedTokenBalances(walletAddress, tx, true);
        const wsolChange = changes.find((change) => change.mint == kSolAddress);
        if (wsolChange){
            return wsolChange.amountChange;
        }

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

    static getSwapDescription(chain: Chain, swap: ParsedSwap | undefined, walletAddress: string | undefined, programName: string): TxDescription | undefined {
        if (walletAddress && swap && swap.from && swap.to){
            const addresses = [walletAddress, swap.from.mint, swap.to.mint];
            const fromAmountString = Helpers.bnToUiAmount(new BN(swap.from.amount), swap.from.decimals);
            const toAmountString = Helpers.bnToUiAmount(new BN(swap.to.amount), swap.to.decimals);
            
            const description: TxDescription = {
                html: `<a href="${ExplorerManager.getUrlToAddress(chain, addresses[0])}">{address0}</a> swapped ${fromAmountString} <a href="${ExplorerManager.getUrlToAddress(chain, addresses[1])}">{address1}</a> for ${toAmountString} <a href="${ExplorerManager.getUrlToAddress(chain, addresses[2])}">{address2}</a> on ${programName}`,
                addresses: addresses,
            };  
            return description;                      
        }
    }

    static findTxLogs(tx: web3.ParsedTransactionWithMeta, containsQuery: string): string[] {
        const logs: string[] = [];
        if (tx.meta?.logMessages){
            for (let index = 0; index < tx.meta?.logMessages.length; index++) {
                const log = tx.meta?.logMessages[index];
                if (log.includes(containsQuery)){
                    logs.push(log);
                }                
            }
        }

        return logs;
    }

    static findProgramName(programId: string): string | undefined {
        return kPrograms[programId]?.name;
    }

}