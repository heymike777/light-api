import { Chain } from "../services/solana/types";

export class EnvManager {

    static isGeyserProcess = process.env.IS_GEYSER_PROCESS === 'true';
    static chain = process.env.CHAIN ? process.env.CHAIN as Chain : Chain.SOLANA;

    static isCronProcess = process.env.IS_CRON_PROCESS === 'true';
    static isMainProcess = process.env.IS_MAIN_PROCESS === 'true';
    static isTelegramProcess = process.env.IS_TELEGRAM_PROCESS === 'true';
    static isWalletGeneratorProcess = process.env.IS_WALLET_GENERATOR_PROCESS === 'true';
    
}