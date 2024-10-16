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
import fs from "fs";

export class MigrationManager {

    static async migrate() {


        console.log('MigrationManager', 'migrate', 'start');
        const chatId = 862473;
        const signature = '5pDUM7e2M2gpb54i18Byu1QE69TNQ91H7z8tZZpfMH7reqaZVMht7BVuTeSmdZCVgBfbc6JwpVRHwYDZbvmDsYZZ';
        // await this.processTx(signature, chatId);

        // const mint = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
        // const tokenName = 'BONK';
        // const inlineKeyboard = BotManager.buildInlineKeyboardForToken(Chain.SOLANA, InlineKeyboardType.TOKEN_TX, mint, tokenName);

        // await BotManager.sendMessage({
        //     chatId, 
        //     text: 'BONK BONK BONK 🔥🔥🔥',
        //     inlineKeyboard
        // });

        // await AppStoreManager.sendTestPaymentWebhook();

        
        // const realParsedTxs = await SolanaManager.getParsedTransactions(newConnection(), ['DPCPsHa5D3ptocGrApQHnhMKAhjzXh1vVa8g5dn34ciZLpdsX1eGoJJ8T8VPprsPVYP4JEz77cMChoovN6stUUe']);
        // console.log('!!!realParsedTxs', JSON.stringify(realParsedTxs));


        fs.writeFileSync('transactions.txt', `${new Date()} start\n`);

        console.log('MigrationManager', 'migrate', 'done');
    }

    static async processTx(signature: string, chatId: number) {
        const wallets = await Wallet.find({ userId: '66eefe2c8fed7f2c60d147ef' });
        const chats = [{
            id: chatId,
            wallets: wallets,
        }];
        const connection = newConnection();
        const tx = await SolanaManager.getParsedTransaction(connection, signature);
        console.log('!tx', JSON.stringify(tx));
        if (tx){
            await WalletManager.processTxForChats(signature, tx, chats);
        }
    }

}