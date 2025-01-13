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
import { UserTransaction } from "../entities/users/UserTransaction";
import fs from "fs";
import { SystemNotificationsManager } from "../managers/SytemNotificationsManager";
import jwt from "express-jwt";
import { SubscribeRequest } from "@triton-one/yellowstone-grpc";
import { SubscriptionManager } from "../managers/SubscriptionManager";
import { Subscription, SubscriptionPlatform, SubscriptionTier } from "../entities/payments/Subscription";
import { RevenueCatManager } from "../managers/RevenueCatManager";
import { UserManager } from "../managers/UserManager";
import { User } from "../entities/users/User";
import { UserRefClaim } from "../entities/users/UserRefClaim";
import { Message } from "../entities/Message";
import { Auth } from "../entities/Auth";
import { PushToken } from "../entities/PushToken";
import { GiftCard } from "../entities/giftCards/GiftCard";
import { GiftCardClaim } from "../entities/giftCards/GiftCardClaim";
import { Token } from "../entities/tokens/Token";
import { TokenPair } from "../entities/tokens/TokenPair";
import { TokenSwap } from "../entities/tokens/TokenSwap";
import { SolScanManager } from "./solana/SolScanManager";
import { LogManager } from "../managers/LogManager";
import { UserTraderProfile } from "../entities/users/TraderProfile";
import { SwapManager } from "../managers/SwapManager";
import { Swap } from "../entities/payments/Swap";

export class MigrationManager {

    static kBonk = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
    static kPyth = 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3';

    static async migrate() {
        if (process.env.SERVER_NAME != 'heynova0'){
            SystemNotificationsManager.sendSystemMessage('Server started');
        }
        LogManager.forceLog('MigrationManager', 'migrate', 'start');
        this.syncIndexes();
        const chatId = 862473;

        // await SolanaManager.getAssetsByOwner('9Xt9Zj9HoAh13MpoB6hmY9UZz37L4Jabtyn8zE7AAsL')

        // const swap = await Swap.findOne({ });
        // if (swap){
        //     LogManager.log('MigrationManager', 'migrate', 'swap', swap);
        //     await SwapManager.sendSwapErrorToUser(swap);
        // }

        // await this.testToken(this.kPyth);

        // await TokenManager.fetchDigitalAsset(this.kBonk);

        // await SubscriptionManager.updateUserSubscription('66fe7b5989633c0aa6dad946');
        
        // await this.processTx('2FWUBZ8eWNBehKB7s8ApnGMnXCNgi74HkBor4PjCvJFN12SRQfPFy9QoRJgCdqGYUWEppfueqTpRDU21FMettyuL'); // pumpfun
        // await this.processTx('63iupjmC6HBqoQKiQVkQmyooc6368Vr7wnmvQmqFXL6R8YNTaDDwYYrDv9givmeYme1kqLqFNtdv5tNgpJ1ni99U'); // raydium
        // await this.processTx('4ATvDVMuSPkcBH6QwLtxkV5DG5HhepiCiE5dYF5BjPcnKimLEq4b5nRnANdQ3WGMZeg69WZNh1QY5h9NWioTGnrh'); // raydium
        // await this.processTx('54Q2VnyP9tLZo3oxCPUpNwxNmZrg32hkmNiDJ4LMEBfxSYAuuBxJuPZrgQESfaxYDPgRZa55CXCKAVEiRruFvNrH'); // jupiter
        // await this.processTx('5snNUQUXKY7iJFnaBBv6LjWYuBAryQX3mTdtHorboe6mXrZpv694mXCQucho2W2PDGumsTAqykkqsqhs5FNLuAph'); // MAGIC EDEN AMM
        // await this.processTx('26R1Je6V5Pv2g38ejgFbjXm3qQvrC8Qn7TH3pyNMG2QrEdWU2j7Am9vJdCMyNzeyu9wYXMVVNNuM8v5fwMPDfNfA'); // NFT SALE on !!!MAGIC_EDEN_V2
        // await this.processTx('42Jybm1JcyGWQx3AAMZffwK3QagUb2RkWgJ3v3bHgoF7vV7xAXuGxiGouNE5K6czPtBNKcAqkY1kcLprmWJwf8Sn');
        // await this.processTx('5XuB98XVfwMLLPetV5hzZt65P89WuN4YLTj6NSmz5uoiwc8qpqF2TPPoY8gsPHrFQgQYRWUQTphrU99eQNXTn2HV'); //jupiter

        // await this.processTx('33KvrJbdkLMQPPzeex1idWA9A6oUYi7Fkdnf84Mk52UPxA571v65z2JCBwgHBkwfjcY5zmT9iHrC9RFhaHw8kKAE'); // Tensor 
        // await this.processTx('2BijsH1TPDuNJbAHZzc1wgEU8p6C2WWpVwhTQZmqR6oEorHL6UPARHi55NFrPPSWE9MFobvNyMGdgczfoDCpS4T8'); // cNFT on Tensor_CNFT
        // await this.processTx('5NY9KTmssHEzrqa7ZjBX74PM3w35qruChz2S4B5A5LJFXppTvfgUN7ns7vNqzRiJaoUh8UVStfWdvJWuLU6DezYV'); // TENSOR
        // await this.processTx('8cEwWEwEhPFLLkb5VjCouPGcnFhQCCz99BvX2pZCeSnWJraY1oGNadMHdeAtNArfgBwUvhPkGgn7UVUFDQ3NFwG'); // Jupiter Z


        // const mint = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
        // const tokenName = 'BONK';
        // const inlineKeyboard = BotManager.buildInlineKeyboardForToken(Chain.SOLANA, InlineKeyboardType.TOKEN_TX, mint, tokenName);

        // await BotManager.sendMessage({
        //     chatId, 
        //     text: 'BONK BONK BONK 🔥🔥🔥',
        //     inlineKeyboard
        // });
        
        // await this.migrateValidators();
        // await this.findTransactionsWithoutDescription();
        
        // await this.migrateUserEnginesToTraderProfiles();

        LogManager.forceLog('MigrationManager', 'migrate', 'done');
    }

    static async migrateUserEnginesToTraderProfiles() {
        const users = await User.find({ engine: { $exists: true } });
        console.log('MigrationManager', 'migrateUserEnginesToTraderProfiles', 'users', users.length);

        for (const user of users) {
            const engineId = user.engine;
            if (!engineId) {
                continue;
            }

            const engine = SwapManager.engines.find((e) => e.id === engineId);
            if (!engine) {
                console.error('MigrationManager', 'migrateUserEnginesToTraderProfiles', 'engine not found', engineId);
                continue;
            }

            const profile = new UserTraderProfile();
            profile.userId = user.id;
            profile.engineId = engine.id;
            profile.title = engine.title;
            profile.default = true;
            profile.active = true;
            profile.createdAt = new Date();
            await profile.save();

            console.log('MigrationManager', 'migrateUserEnginesToTraderProfiles', 'userId', user.id, 'engineId', engine.id, engine.title, 'trader profile created');
        }
    }

    static async testToken(mint: string){
        const pairs = await TokenPair.find({ $or: [{ token1: mint }, { token2: mint }] });
        LogManager.log('testToken', mint, 'pairs', pairs.length);
        const token = await Token.findOne({ address: mint });
        if (!token){
            throw new Error('Token not found');
        }
        let liquidity = await TokenManager.getUsdLiquidityForToken(token);
        LogManager.log('testToken', mint, `Liquidity: $${liquidity}`);
    }

    static async syncIndexes(){
        await User.syncIndexes();
        await UserRefClaim.syncIndexes();
        await UserTransaction.syncIndexes();
        await Message.syncIndexes();
        await Wallet.syncIndexes();
        await Program.syncIndexes();
        await Auth.syncIndexes();
        await PushToken.syncIndexes();
        await Subscription.syncIndexes();
        await GiftCard.syncIndexes();
        await GiftCardClaim.syncIndexes();
        await Token.syncIndexes();
        await TokenPair.syncIndexes();
        await TokenSwap.syncIndexes();
        await UserTraderProfile.syncIndexes();
    }

    static async processTx(signature: string) {
        const userId = process.env.ENVIRONMENT === 'PRODUCTION' ? '66eefe2c8fed7f2c60d147ef' : '66ef97ab618c7ff9c1bbf17d';

        await UserTransaction.deleteOne({ signature, userId });

        const wallets = await Wallet.find({ userId: userId, status: {$in: [WalletStatus.ACTIVE, WalletStatus.TRADER]} });
        const user = await UserManager.getUserById(userId, true);
        const chats = [{user, wallets}];
        // LogManager.log('!!!wallets', wallets.map((wallet) => wallet.walletAddress));
        const connection = newConnection();
        const tx = await SolanaManager.getParsedTransaction(connection, signature);
        // LogManager.log('!tx', JSON.stringify(tx));
        if (tx){
            await WalletManager.processTxForChats(signature, tx, chats, 'test');
        }
    }

    static async migrateValidators() {
        const validatorsJson = `[list of validators from solanabeach]`;
        const validators = JSON.parse(validatorsJson);
        for (const tmp of validators) {
            if (tmp.moniker && tmp.moniker.length > 0) {
                LogManager.log(`'${tmp.votePubkey}': {name: \`${tmp.moniker}\`},`);
            }
        }
    }

    static async findTransactionsWithoutDescription() {
        LogManager.log('findTransactionsWithoutDescription start');
        const transactions = await UserTransaction.find({"parsedTx.parsedInstructions.0.description": { $exists: false }}).limit(1000);

        let programs: { id: string, count: number }[] = [];
        for (const tx of transactions) {
            for (const ix of tx.parsedTx?.parsedInstructions || []) {
                const program = programs.find((p) => p.id === ix.programId);
                if (program) {
                    program.count++;
                } else {
                    programs.push({ id: ix.programId, count: 1 });
                }
            }   
        }

        programs = programs.sort((a, b) => b.count - a.count);
        let index = 0;
        for (const p of programs) {
            LogManager.log(index++, 'programId:', p.id, 'count:', p.count);
        }
        LogManager.log('findTransactionsWithoutDescription done');
    }

}