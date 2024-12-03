import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Program } from "../entities/Program";
import { IWallet, Wallet, WalletStatus } from "../entities/Wallet";
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
import { UserTransaction } from "../entities/UserTransaction";
import fs from "fs";
import { SystemNotificationsManager } from "../managers/SytemNotificationsManager";
import jwt from "express-jwt";
import { SubscribeRequest } from "@triton-one/yellowstone-grpc";
import { SubscriptionManager } from "../managers/SubscriptionManager";
import { SubscriptionPlatform, SubscriptionTier } from "../entities/payments/Subscription";
import { RevenueCatManager } from "../managers/RevenueCatManager";

export class MigrationManager {

    static async migrate() {
        if (process.env.SERVER_NAME != 'heynova0'){
            SystemNotificationsManager.sendSystemMessage('Server started');
        }

        console.log('MigrationManager', 'migrate', 'start');
        const chatId = 862473;
        const mikeUserId = '66eefe2c8fed7f2c60d147ef';

        // await RevenueCatManager.getCustomerSubscriptions(mikeUserId);
        
        // await SubscriptionManager.createSubscription(mikeUserId, SubscriptionTier.PLATINUM, SubscriptionPlatform.SOLANA, new Date('2024-12-31'));
        
        // const signature = '2FWUBZ8eWNBehKB7s8ApnGMnXCNgi74HkBor4PjCvJFN12SRQfPFy9QoRJgCdqGYUWEppfueqTpRDU21FMettyuL'; // pumpfun
        // const signature = '63iupjmC6HBqoQKiQVkQmyooc6368Vr7wnmvQmqFXL6R8YNTaDDwYYrDv9givmeYme1kqLqFNtdv5tNgpJ1ni99U'; // raydium
        // const signature = '54Q2VnyP9tLZo3oxCPUpNwxNmZrg32hkmNiDJ4LMEBfxSYAuuBxJuPZrgQESfaxYDPgRZa55CXCKAVEiRruFvNrH'; // jupiter
        // const signature = '26R1Je6V5Pv2g38ejgFbjXm3qQvrC8Qn7TH3pyNMG2QrEdWU2j7Am9vJdCMyNzeyu9wYXMVVNNuM8v5fwMPDfNfA'; // NFT SALE on !!!MAGIC_EDEN_V2
        // const signature = '5zDEApR6A998AdbmhebMFqbsSvVFwMmA7f6RR4QK5V4VNG99Yrgf4NdhfB3SpKK4wEBzCWXZvr3fazgBSyrfQWg3'; // cNFT on Tensor_CNFT
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
        
        // fs.writeFileSync('transactions.txt', `${new Date()} start\n`);
        // fs.writeFileSync('transactions_account_keys.txt', `${new Date()} start\n`);

        // await this.migrateValidators();

        console.log('MigrationManager', 'migrate', 'done');
    }

    static async processTx(signature: string, chatId: number) {
        const userId = process.env.ENVIRONMENT === 'PRODUCTION' ? '66eefe2c8fed7f2c60d147ef' : '66ef97ab618c7ff9c1bbf17d';
        const wallets = await Wallet.find({ userId: userId, status: WalletStatus.ACTIVE });
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

    static async migrateValidators() {
        const validatorsJson = `[list of validators from solanabeach]`;
        const validators = JSON.parse(validatorsJson);
        for (const tmp of validators) {
            if (tmp.moniker && tmp.moniker.length > 0) {
                console.log(`'${tmp.votePubkey}': {name: \`${tmp.moniker}\`},`);
            }

        }

    }

}