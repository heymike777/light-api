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

export interface ParsedTx {
    title: string;
    description?: TxDescription;
    assetId?: string;
    signature: string;
    walletsInvolved: string[];
    preBalances?: number[];
    postBalances?: number[];
    preTokenBalances?: web3.TokenBalance[];
    postTokenBalances?: web3.TokenBalance[];
    blockTime: number;
    accounts: string[];
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

    static parseParsedIx(programId: string, ixParsed: any | ParserOutput, previousIxs?: (web3.ParsedInstruction | web3.PartiallyDecodedInstruction)[], accounts?: web3.PublicKey[], tx?: web3.ParsedTransactionWithMeta): {description?: TxDescription} {
        if (!ixParsed){
            return {};
        }

        let description: TxDescription | undefined;

        if (programId == kProgram.SOLANA){
            if (ixParsed.type == 'transfer' || ixParsed.type == 'transferWithSeed'){
                const addresses = [ixParsed.info.source, ixParsed.info.destination];
                description = {
                    plain: `{address0} transfered ${ixParsed.info.lamports / web3.LAMPORTS_PER_SOL} SOL to {address1}`,
                    html: `<a href="${ExplorerManager.getUrlToAddress(addresses[0])}">{address0}</a> transfered <b>${ixParsed.info.lamports / web3.LAMPORTS_PER_SOL} SOL</b> to <a href="${ExplorerManager.getUrlToAddress(addresses[1])}">{address1}</a>`,
                    addresses,
                };
            }
        }
        else if (programId == kProgram.STAKE_PROGRAM){
            if (ixParsed.type == 'delegate'){
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
            else if (ixParsed.type == 'withdraw'){
                const stakeAmountString = ixParsed.info.lamports ? `${ixParsed.info.lamports / web3.LAMPORTS_PER_SOL} SOL` : 'SOL';

                const addresses = [ixParsed.info.destination, ixParsed.info.withdrawAuthority, ixParsed.info.stakeAccount];
                description = {
                    plain: `{address0} unstaked ${stakeAmountString} from {address1}`,
                    html: `<a href="${ExplorerManager.getUrlToAddress(addresses[0])}">{address0}</a> unstaked ${stakeAmountString} from <a href="${ExplorerManager.getUrlToAddress(addresses[1])}">{address1}</a>`,
                    addresses,
                };
            }
            else if (ixParsed.type == 'deactivate'){
                const addresses = [ixParsed.info.stakeAuthority, ixParsed.info.stakeAccount];
                description = {
                    plain: `{address0} deactivated stake account {address1}`,
                    html: `<a href="${ExplorerManager.getUrlToAddress(addresses[0])}">{address0}</a> deactivated stake account <a href="${ExplorerManager.getUrlToAddress(addresses[1])}">{address1}</a>`,
                    addresses,
                };
            }
        }
        else if (programId == kProgram.TOKEN_PROGRAM){
            if (ixParsed.type == 'transferChecked'){
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

                if (ixParsed.name == 'buy') {
                    description = {
                        plain: `{address0} bought ${amount} {address1} on Pump Fun`,
                        html: `<a href="${ExplorerManager.getUrlToAddress(addresses[0])}">{address0}</a> bought ${amount} <a href="${ExplorerManager.getUrlToAddress(addresses[1])}">{address1}</a> on Pump Fun`,
                        addresses: addresses,
                    };    
                }
                else if (ixParsed.name == 'sell') {
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
                const walletAddress = accounts?.[17]?.toBase58();
                if (walletAddress && tx?.meta){
                    const changes = this.findChangedTokenBalances(walletAddress, tx.meta, false);
                    console.log('!changes:', changes);

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
                const walletAddress = accounts?.[2]?.toBase58();
                if (walletAddress && tx?.meta){
                    const changes = this.findChangedTokenBalances(walletAddress, tx.meta, false);
                    console.log('!changes:', changes);

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

        return {
            description,
        };
    }

    static async parseIx(programId: string, ixData: string): Promise<{output: ParserOutput, programName?: string} | undefined>{
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
            console.error(`Error fetching program name for ${programId}:`, error);
            // Cache the error case as undefined
            this.programNameCache.set(programId, undefined);
            return undefined;
        }
    }

    static async parseTx(tx: web3.ParsedTransactionWithMeta): Promise<ParsedTx> {
        let parsedInstructions: ParsedIx[] = [];

        const walletsInvolved = WalletManager.getInvolvedWallets(tx);
        const instructions: (web3.ParsedInstruction | web3.PartiallyDecodedInstruction)[] = [
            ...tx.transaction.message.instructions,
        ];
        if (tx.meta?.innerInstructions){
            for (const innerIx of tx.meta?.innerInstructions) {
                instructions.push(...innerIx.instructions)
            }
        }
        
        let ixIndex = 0;
        let previousIxs: (web3.ParsedInstruction | web3.PartiallyDecodedInstruction)[] = [];
        for (const instruction of instructions) {
            const ixProgramId = instruction.programId.toBase58();
            if (kSkipProgramIds.indexOf(ixProgramId) != -1){
                continue;
            }

            if ('parsed' in instruction){
                console.log('instruction', ixIndex++, 'ixProgramId:', ixProgramId, 'parsed', '=', instruction.parsed);

                const info = this.parseParsedIx(ixProgramId, instruction.parsed, previousIxs, undefined, tx);
                
                let programName: string | undefined = kPrograms[ixProgramId]?.name;
                let ixTitle: string | undefined = instruction.parsed.type;
                const knownInstruction = this.findKnownInstruction(ixProgramId, ixTitle);
                ixTitle = knownInstruction ? knownInstruction.title : ixTitle;

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
                console.log('instruction', ixIndex++, 'ixProgramId:', ixProgramId, 'ixData', '=', ixData);

                const info = this.parseParsedIx(ixProgramId, ixData?.output, previousIxs, instruction.accounts, tx);

                let ixTitle = ixData?.output?.name;
                const knownInstruction = this.findKnownInstruction(ixProgramId, ixTitle);
                ixTitle = knownInstruction ? knownInstruction.title : ixTitle;

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
        let txDescription: TxDescription | undefined;
        let assetId: string | undefined;

        parsedInstructions = parsedInstructions.sort((a, b) => a.priority - b.priority);
        console.log('parsedInstructions (sorted by priority)', JSON.stringify(parsedInstructions));

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

                txDescription = parsedInstruction.description;

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
            description: txDescription,
            assetId,
            signature: tx?.transaction?.signatures?.[0] || '',
            walletsInvolved,
            preTokenBalances: tx.meta?.preTokenBalances || undefined,
            postTokenBalances: tx.meta?.postTokenBalances || undefined,
            preBalances: tx.meta?.preBalances || undefined,
            postBalances: tx.meta?.postBalances || undefined,
            blockTime: tx.blockTime || Math.floor(Date.now() / 1000),
            accounts: tx.transaction.message.accountKeys.map((key) => key.pubkey.toBase58()),
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

    static findChangedTokenBalances(walletAddress: string, meta: web3.ParsedTransactionMeta, inclideWsol = true): {mint: string, uiAmountChange: number}[] {
        const preBalances = meta.preTokenBalances || [];
        const postBalances = meta.postTokenBalances || [];

        const preBalancesMap: {[key: string]: web3.TokenBalance | undefined} = {};
        for (const balance of preBalances) {
            if (balance.owner == walletAddress){
                preBalancesMap[balance.mint] = balance;
            }
        }

        let changedBalances: {mint: string, uiAmountChange: number}[] = [];
        for (const postBalance of postBalances) {
            if (postBalance.owner == walletAddress){
                const preBalance = preBalancesMap[postBalance.mint];
                if (!preBalance || preBalance.uiTokenAmount.uiAmount != postBalance.uiTokenAmount.uiAmount){
                    const uiAmountChange = (postBalance.uiTokenAmount.uiAmount || 0) - (preBalance?.uiTokenAmount.uiAmount || 0);
                    if (uiAmountChange != 0){
                        changedBalances.push({ mint: postBalance.mint, uiAmountChange: uiAmountChange });
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
                changedBalances.push({ mint: balance.mint, uiAmountChange: balance.uiTokenAmount.uiAmount });
            }
        }

        if (!inclideWsol){
            changedBalances = changedBalances.filter((balance) => balance.mint != kSolAddress);
        }

        return changedBalances;
    }

}