import { Program } from "../entities/Program";

export class ProgramManager {

    static programIds: string[] = [];

    static async addProgram(programId: string){
        try {
            if (this.programIds.indexOf(programId) == -1){
                this.programIds.push(programId);

                await Program.create({ programId });
            }
        }
        catch (error){}
    }        

}