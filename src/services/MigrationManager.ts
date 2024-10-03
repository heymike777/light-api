import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Program } from "../entities/Program";
import { IWallet, Wallet } from "../entities/Wallet";
import { BotManager, InlineKeyboardType } from "../managers/bot/BotManager";
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
import { InlineKeyboard } from "grammy";

export class MigrationManager {

    static async migrate() {


        console.log('MigrationManager', 'migrate', 'start');
        const chatId = 862473;

        // const signature = '2ZwVpUivC3pwPkFnSbK45xzw2jDji4B7qWzTn7PxvUpsUEydLBWWXtZa1mtqoRV9pFWnPAKeY2Rny2ax3pkXwUZ9';
        // const signature = '2T7mEAvLtNN9bn6bu1mzwTZv9MGfsnXcvRbPEiCYqSdpjvYs393CUssq6qmzywv7BWQGcGzyafVp2RE12QsixJcH';

        // const wallets = await Wallet.find({ chatId });
        // // console.log('MigrationManager', 'migrate', 'wallets', wallets);
        // const chats = [{
        //     id: chatId,
        //     wallets: wallets,
        // }];
        // const connection = newConnection();
        // const tx = await SolanaManager.getParsedTransaction(connection, signature);
        // console.log('!tx', JSON.stringify(tx));
        // if (tx){
        //     await WalletManager.processTxForChats(signature, tx, chats);
        // }


        

        // const mint = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
        // const tokenName = 'BONK';
        // const inlineKeyboard = BotManager.buildInlineKeyboardForToken(Chain.SOLANA, InlineKeyboardType.TOKEN_TX, mint, tokenName);

        // await BotManager.sendMessage({
        //     chatId, 
        //     text: 'BONK BONK BONK 🔥🔥🔥',
        //     inlineKeyboard
        // });

        console.log('MigrationManager', 'migrate', 'done');
    }

}