import { Program } from "../entities/Program";
import { getProgramIdl, IdlItem } from "@solanafm/explorer-kit-idls";
import { Chain } from "../services/solana/types";
import { checkIfInstructionParser, ParserType, SolanaFMParser } from "@solanafm/explorer-kit";

export class ProgramManager {

    static programIds: string[] = [];
    static idls: Map<string, IdlItem> = new Map();

    static async addProgram(programId: string, chain: Chain = Chain.SOLANA){
        try {
            if (this.programIds.indexOf(programId) == -1){
                this.programIds.push(programId);

                await Program.create({ programId, chain });
            }
        }
        catch (error){}
    }        

    static async fetchIDLs(chain: Chain = Chain.SOLANA){
        if (chain == Chain.SOLANA){
            // const programId = "PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY";
            // const idl = await getProgramIdl(programId);
            // console.log(programId, 'idl is:', idl);    
        }
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

    static async parseIx(programId: string, ixData: string, chain: Chain = Chain.SOLANA){
        const idl = await this.getIDL(programId, chain);
        if (idl){
            const parser = new SolanaFMParser(idl, programId);
            const instructionParser = parser.createParser(ParserType.INSTRUCTION);
            
            if (instructionParser && checkIfInstructionParser(instructionParser)) {
                const decodedData = instructionParser.parseInstructions(ixData);
            }
        }

        return undefined;
    }

}