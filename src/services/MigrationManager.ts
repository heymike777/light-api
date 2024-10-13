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
import { FirebaseManager } from "../managers/FirebaseManager";
import { AppStoreManager } from "../managers/AppStoreManager";
import { UserTransaction } from "../entities/UserTransaction";

export class MigrationManager {

    static async migrate() {


        console.log('MigrationManager', 'migrate', 'start');
        const chatId = 862473;

        // const signature = '56Sn9p3NKE82D6znVu3ASEt1AZCyMKGZj5NN21GaJsMHay4pPa8YzkwQW6Yi43Q2kFqZUzQqtVpwniZAo7xeiQPt';

        // const wallets = await Wallet.find({ userId: '66eefe2c8fed7f2c60d147ef' });
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

        // await AppStoreManager.sendTestPaymentWebhook();

        console.log('MigrationManager', 'migrate', 'done');
    }

}