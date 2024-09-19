import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Program } from "../entities/Program";
import { IWallet, Wallet } from "../entities/Wallet";
import { BotManager } from "../managers/bot/BotManager";
import { ProgramManager } from "../managers/ProgramManager";
import { ExplorerManager } from "./explorers/ExplorerManager";
import { HeliusManager } from "./solana/HeliusManager";
import { Chain } from "./solana/types";
import { Helpers } from "./helpers/Helpers";
import { BN } from "bn.js";
import { SolanaManager } from "./solana/SolanaManager";
import { newConnection } from "./solana/lib/solana";
import { TokenBalance } from "@solana/web3.js";
import { kSolAddress } from "./solana/Constants";
import { WalletManager } from "../managers/WalletManager";
import { JupiterManager } from "../managers/JupiterManager";
import { TokenManager } from "../managers/TokenManager";
import { MetaplexManager } from "../managers/MetaplexManager";

export class MigrationManager {

    static async migrate() {
        console.log('MigrationManager', 'migrate', 'start');
        const chatId = 862473;

        // await BotManager.sendMessage(chatId, 'Hello');

        // await ProgramManager.fetchIDLs();

        // const signature = 'TR4cA3UuXL43nTMbcBYGsBGuc3Q93Mvu6FRGa2R8TvA3WzYDBei9ARNeYja1TzKn1raZaCt8Dd7r3jcrQ4pa79a';
        // const wallets = await Wallet.find({ chatId });
        // const chats = [{
        //     id: chatId,
        //     wallets: wallets,
        // }];
        // await WalletManager.processTxForChats(signature, chats);

        // process.exit(0);

        // const mints = ['So11111111111111111111111111111111111111112', 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'];
        // await MetaplexManager.fetchAllDigitalAssets(mints);

        // await TokenManager.getToken('EchesyfXePKdLtoiZSL8pBe8Myagyy8ZRqsACNCFGnvp');
        // await TokenManager.getToken('FoXyMu5xwXre7zEoSvzViRk3nGawHUp9kUh97y2NDhcq');


        console.log('MigrationManager', 'migrate', 'done');
    }

}