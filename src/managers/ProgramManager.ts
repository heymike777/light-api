import { Program } from "../entities/Program";
import { getProgramIdl, IdlItem } from "@solanafm/explorer-kit-idls";
import { Chain } from "../services/solana/types";
import { checkIfInstructionParser, ParserOutput, ParserType, SolanaFMParser } from "@solanafm/explorer-kit";
import * as web3 from "@solana/web3.js";
import { newConnection } from "../services/solana/lib/solana";

export interface ParsedTx {
    title: string;
}

export class ProgramManager {
    static kSkipProgramIds = ['ComputeBudget111111111111111111111111111111'];
    static kProgramNames: { [key: string]: string } = {
        'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA': 'TOKEN PROGRAM',
        '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'RAYDIUM',
        'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': 'JUPITER',
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

    static async getIDL(programId: string, chain: Chain = Chain.SOLANA): Promise<IdlItem | undefined>{
        if (chain == Chain.SOLANA){
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

        return undefined;
    }

    static async parseIx(programId: string, ixData: string, chain: Chain = Chain.SOLANA): Promise<{output: ParserOutput, programName?: string} | undefined>{
        const idl = await this.getIDL(programId, chain);
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

    static async parseTx(tx: web3.ParsedTransactionWithMeta, chain: Chain = Chain.SOLANA): Promise<ParsedTx> {
        const connection = newConnection();
        const parsedInstructions: {programId: string, program?: string, title?: string}[] = [];
        let title = '';

        let ixIndex = 0;
        for (const instruction of tx.transaction.message.instructions) {
            const ixProgramId = instruction.programId.toBase58();
            if (ProgramManager.kSkipProgramIds.indexOf(ixProgramId) != -1){
                continue;
            }

            if ('parsed' in instruction){
                console.log('instruction', ixIndex++, 'ixProgramId:', ixProgramId, 'parsed', '=', instruction.parsed);

                parsedInstructions.push({
                    programId: ixProgramId,
                    program: undefined,
                    title: 'UNKNOWN',
                });

            }
            else {
                const ixData = await ProgramManager.parseIx(ixProgramId, instruction.data);
                console.log('instruction', ixIndex++, 'ixProgramId:', ixProgramId, 'ixData', '=', ixData);
                parsedInstructions.push({
                    programId: ixProgramId,
                    program: ixData?.programName || undefined,
                    title: ixData?.output?.name,
                });
            }
        }

        console.log('parsedInstructions', parsedInstructions);

        for (const parsedInstruction of parsedInstructions) {
            if (parsedInstruction.program){
                if (title.length > 0){
                    title += ', ';
                }
                
                if (parsedInstruction.title){
                    title += parsedInstruction.title + ' on ';
                }
                title += parsedInstruction.program;
            }
        }

        if (title.length == 0){
            title = 'UNKNOWN';
        }

        return {
            title,
        };
    }

}