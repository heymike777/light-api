import { Program } from "../entities/Program";
import { ProgramManager } from "../managers/ProgramManager";
import { Chain } from "./solana/types";

export class MigrationManager {

    static async migrate() {
        console.log('MigrationManager', 'migrate', 'start');

        // await ProgramManager.fetchIDLs();

        await Program.updateMany({}, { $set: { chain: Chain.SOLANA } });

        console.log('MigrationManager', 'migrate', 'done');
    }

}