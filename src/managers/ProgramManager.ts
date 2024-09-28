import { Program } from "../entities/Program";
import { getProgramIdl, IdlItem } from "@solanafm/explorer-kit-idls";
import { Chain } from "../services/solana/types";
import { checkIfInstructionParser, ParserOutput, ParserType, SolanaFMParser } from "@solanafm/explorer-kit";
import * as web3 from "@solana/web3.js";
import { ExplorerManager } from "../services/explorers/ExplorerManager";
import { Helpers } from "../services/helpers/Helpers";

export interface ParsedTx {
    title: string;
    description?: TxDescription;
    assetId?: string;
}

export interface TxDescription {
    plain: string;
    html: string;
}

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


}

export class ProgramManager {
    static kSkipProgramIds = [
        kProgram.COMPUTE_BUDGET as string,
        kProgram.SOL_INCINERATOR as string,
    ];
    static kProgramNames: { [key: string]: string } = {
        'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA': 'TOKEN PROGRAM',
        '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'RAYDIUM',
        'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': 'JUPITER',
        'F6fmDVCQfvnEq2KR8hhfZSEczfM9JK9fWbCsYJNbTGn7': 'SOL INCINERATOR',
        'TSWAPaqyCSx2KABk68Shruf4rp7CxcNi8hAsbdwmHbN': 'TENSOR',
        'TCMPhJdwDryooaGtiocG1u3xcYbRpiJzb283XfCZsDp': 'TENSOR',
        'mmm3XBJg5gk8XJxEKBvdgptZz6SgK4tXvn36sodowMc': 'MAGIC EDEN',
    };

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

    static parseParsedIx(programId: string, ixParsed: any): {description?: TxDescription} {
        if (!ixParsed){
            return {};
        }

        let description: TxDescription | undefined;

        if (programId == kProgram.SOLANA){
            if (ixParsed.type == 'transfer'){

                const sourceWalletTitle = Helpers.prettyWallet(ixParsed.info.source);
                const destinationWalletTitle = Helpers.prettyWallet(ixParsed.info.destination);

                description = {
                    plain: `${ixParsed.info.source} transfered ${ixParsed.info.lamports / web3.LAMPORTS_PER_SOL} SOL to ${ixParsed.info.destination}`,
                    html: `<a href="${ExplorerManager.getUrlToAddress(ixParsed.info.source)}">${sourceWalletTitle}</a> transfered <b>${ixParsed.info.lamports / web3.LAMPORTS_PER_SOL} SOL</b> to <a href="${ExplorerManager.getUrlToAddress(ixParsed.info.destination)}">${destinationWalletTitle}</a>`,
                };
            }
        }
        else if (programId == kProgram.TOKEN_PROGRAM){
            if (ixParsed.type == 'transferChecked'){
            }
        }

        return {
            description,
        };
    }

    static async parseIx(programId: string, ixData: string): Promise<{output: ParserOutput, programName?: string} | undefined>{
        const idl = await this.getIDL(programId);
        // console.log('idl', idl);
        if (idl){
            const parser = new SolanaFMParser(idl, programId);
            const instructionParser = parser.createParser(ParserType.INSTRUCTION);
            
            if (instructionParser && checkIfInstructionParser(instructionParser)) {
                const output = instructionParser.parseInstructions(ixData);


                let programName: string | undefined = this.kProgramNames[programId];
                if (!programName){
                    programName = (idl.idl as any).name || undefined;
                    programName = programName?.replace('_', ' ');
                    programName = programName?.toUpperCase();
                }

                return  { output, programName };
            }
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
        const parsedInstructions: {
            programId: string, 
            program?: string, 
            title?: string, 
            description?: TxDescription,
            data?: ParserOutput
        }[] = [];

        const instructions: (web3.ParsedInstruction | web3.PartiallyDecodedInstruction)[] = [
            ...tx.transaction.message.instructions,
        ];
        if (tx.meta?.innerInstructions){
            for (const innerIx of tx.meta?.innerInstructions) {
                instructions.push(...innerIx.instructions)
            }
        }
        
        let ixIndex = 0;
        for (const instruction of instructions) {
            const ixProgramId = instruction.programId.toBase58();
            if (ProgramManager.kSkipProgramIds.indexOf(ixProgramId) != -1){
                continue;
            }

            if ('parsed' in instruction){
                console.log('instruction', ixIndex++, 'ixProgramId:', ixProgramId, 'parsed', '=', instruction.parsed);

                const info = this.parseParsedIx(ixProgramId, instruction.parsed);
                
                let programName: string | undefined = this.kProgramNames[ixProgramId];
                let ixTitle: string | undefined = instruction.parsed.type;
                ixTitle = this.renameIx(ixProgramId, ixTitle);

                parsedInstructions.push({
                    programId: ixProgramId,
                    program: programName,
                    title: ixTitle,
                    description: info?.description,
                });

            }
            else {
                const ixData = await ProgramManager.parseIx(ixProgramId, instruction.data);
                console.log('instruction', ixIndex++, 'ixProgramId:', ixProgramId, 'ixData', '=', ixData);

                let ixTitle = ixData?.output?.name;
                ixTitle = this.renameIx(ixProgramId, ixTitle);

                parsedInstructions.push({
                    programId: ixProgramId,
                    program: ixData?.programName || undefined,
                    title: ixTitle,
                    data: ixData?.output,
                });
            }
        }

        console.log('parsedInstructions', JSON.stringify(parsedInstructions));

        let txTitle = '';
        let txDescription: TxDescription | undefined;
        let assetId: string | undefined;

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
                    const ix2 = parsedInstructions.find((ix) => ix.programId == kProgram.TENSOR_CNFT && ix.data?.data?.event?.taker['0']?.assetId);
                    if (ix2){
                        assetId = ix2.data?.data?.event?.taker['0']?.assetId;
                        const taker = ix2.data?.data?.event?.taker['0']?.taker;
                    }
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
        }
    }

    static renameIx(programId: string, title?: string): string | undefined {
        if (!title){
            return title;
        }

        if (programId == kProgram.SOLANA){
            if (title == 'transfer'){
                return 'TRANSFER';
            }
        }
        else if (programId == kProgram.TOKEN_PROGRAM){
            if (title == 'transferChecked'){
                return 'TRANSFER';
            }
        }
        else if (programId == kProgram.RAYDIUM){
            if (['swapBaseIn', 'swapBaseOut'].includes(title)){
                return 'SWAP';
            }
            else if (['initialize', 'initialize2'].includes(title)){
                return 'ADD LIQUIDOTY'
            }
        }
        else if (programId == kProgram.JUPITER){
            if (['routeWithTokenLedger', 'sharedAccountsRoute', 'route', 'exactOutRoute', 'sharedAccountsRouteWithTokenLedger', 'sharedAccountsExactOutRoute', ].includes(title)){
                return 'SWAP';
            }
            else if (['claim', 'claimToken'].includes(title)){
                return 'CLAIM'
            }
        }
        else if (programId == kProgram.TENSOR){
            if (['buyNft', 'buySingleListing', 'sellNftTokenPool', 'sellNftTradePool', 'buyNftT22'].includes(title)){
                return 'NFT SALE';
            }
            else if (title == 'list'){
                return 'NFT LISTING';
            }
            else if (title == 'delist'){
                return 'NFT DELIST';
            }
        }
        else if (programId == kProgram.TENSOR_CNFT){
            if (['buy', 'buySpl', 'buyCore'].includes(title)){
                return 'NFT SALE';
            }
            else if (['list', 'listCore'].includes(title)){
                return 'NFT LIST';
            }
            else if (['delist', 'delistCore'].includes(title)){
                return 'NFT DELIST';
            }
        }
        else if (programId == kProgram.MAGIC_EDEN_AMM){
            if (['solFulfillBuy', 'solMip1FulfillBuy', 'solOcpFulfillBuy', 'solExtFulfillBuy', 'solMplCoreFulfillBuy'].includes(title)){
                return 'NFT SALE';
            }
            else if (['solFulfillSell', 'solMip1FulfillSell', 'solOcpFulfillSell', 'solExtFulfillSell', 'solMplCoreFulfillSell'].includes(title)){
                return 'NFT SALE';
            }
        }

        return title;
    }

}