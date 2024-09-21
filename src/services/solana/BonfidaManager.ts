import { resolve } from "@bonfida/spl-name-service";
import { newConnection } from "./lib/solana";

export class BonfidaManager {

    static async resolveDomain(domain: string): Promise<string | undefined> {
        try {
            if (domain.endsWith('.sol')){
                domain = domain.substring(0, domain.length - 4);
            }

            const connection = newConnection();
            const owner = await resolve(connection, domain);
            const walletAddress = owner.toBase58();
            return walletAddress;
        }
        catch (error){
            console.error('BonfidaManager', 'resolveDomain', error);
        }

        return undefined;
    }

}