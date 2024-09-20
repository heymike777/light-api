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

        // const signature = 'MvLzZUdk4ZA2ho8Dsycytn68FvQYHe9aQE3iqXy5a1EV8mN88wxP3aPL7BwkS7z3hXCodtpz2KMBURPxHUGsBLk';
        // const wallets = await Wallet.find({ chatId });
        // console.log('MigrationManager', 'migrate', 'wallets', wallets);
        // const chats = [{
        //     id: chatId,
        //     wallets: wallets,
        // }];

        // const connection = newConnection();
        // const tx = await SolanaManager.getParsedTransaction(connection, signature);
        // if (tx){
        //     await WalletManager.processTxForChats(signature, tx, chats);
        // }

        // process.exit(0);

        // const mints = ['So11111111111111111111111111111111111111112', 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'];
        // await MetaplexManager.fetchAllDigitalAssets(mints);

        // await TokenManager.getToken('EchesyfXePKdLtoiZSL8pBe8Myagyy8ZRqsACNCFGnvp');
        // await TokenManager.getToken('FoXyMu5xwXre7zEoSvzViRk3nGawHUp9kUh97y2NDhcq');


        console.log('MigrationManager', 'migrate', 'done');
    }

}