import { PublicKey } from "@solana/web3.js";
import { Program } from "../entities/Program";
import { IWallet, Wallet, WalletStatus } from "../entities/Wallet";
import { BotManager } from "../managers/bot/BotManager";
import { ProgramManager } from "../managers/ProgramManager";
import { ExplorerManager } from "./explorers/ExplorerManager";
import { HeliusManager } from "./solana/HeliusManager";
import { Chain, Priority, WalletModel } from "./solana/types";
import { Helpers } from "./helpers/Helpers";
import { BN } from "bn.js";
import { SolanaManager } from "./solana/SolanaManager";
import { newConnection, newConnectionByChain } from "./solana/lib/solana";
import { TokenBalance } from "@solana/web3.js";
import { kSolAddress, kUsdcAddress, kUsdtAddress } from "./solana/Constants";
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
import { SubscriptionManager } from "../managers/SubscriptionManager";
import { Subscription, SubscriptionPlatform, SubscriptionTier } from "../entities/payments/Subscription";
import { RevenueCatManager } from "../managers/RevenueCatManager";
import { UserManager } from "../managers/UserManager";
import { User, UserBotStatus } from "../entities/users/User";
import { UserRefClaim } from "../entities/referrals/UserRefClaim";
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
import * as web3 from '@solana/web3.js';
import { YellowstoneManager } from "./solana/geyser/YellowstoneManager";
import { TxParser } from "./solana/geyser/TxParser";
import { exit } from "process";
import { RedisManager } from "../managers/db/RedisManager";
import mongoose from 'mongoose';
import { InlineKeyboardButton } from "grammy/types";
import { SvmManager } from "../managers/svm/SvmManager";
import { TraderProfilesManager } from "../managers/TraderProfilesManager";
import { EnvManager } from "../managers/EnvManager";
import { RaydiumManager } from "./solana/RaydiumManager";
import { JitoManager } from "./solana/JitoManager";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { StatusType, Swap, SwapDex } from "../entities/payments/Swap";
import { LpMint } from "../entities/tokens/LpMint";
import { Raydium } from "@raydium-io/raydium-sdk-v2";
import { MicroserviceManager } from "../managers/microservices/MicroserviceManager";
import { TokenPriceManager } from "../managers/TokenPriceManager";
import { ReferralsManager } from "../managers/ReferralsManager";
import { UserRefCode } from "../entities/referrals/UserRefCode";
import { UserRefReward } from "../entities/referrals/UserRefReward";
import { Config } from "../entities/Config";
import { UserRefPayout } from "../entities/referrals/UserRefPayout";
import { EncryptionManager } from "../managers/EncryptionManager";
import { PreWallet } from "../entities/PreWallet";
import { LaserstreamManager } from "./solana/geyser/LaserstreamManager";
import { HotToken } from "../entities/tokens/HotToken";
import { TradingEvent } from "../entities/events/TradingEvent";
import { EventsManager } from "../managers/EventsManager";
import { CronManager } from "../managers/CronManager";
import { TradingEventPoints } from "../entities/events/TradingEventPoints";

export class MigrationManager {

    static kBonk = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
    static kPyth = 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3';
    static kChillGuy = 'Df6yfrKC8kZE3KNkrHERKzAetSxbrWeniQfyJY4Jpump';
    static kMikeUserId = process.env.ENVIRONMENT === 'PRODUCTION' ? '66eefe2c8fed7f2c60d147ef' : '66ef97ab618c7ff9c1bbf17d';

    static async migrate() {
        if (process.env.SERVER_NAME == 'light0'){
            TokenPriceManager.updateNativeTokenPrices();
            EventsManager.updateEventStatusses();
            SwapManager.checkPendingSwaps();
        }
        else {
            SystemNotificationsManager.sendSystemMessage('Server started');
            TokenManager.updateTokenPrice(Chain.SOLANA, kSolAddress);
        }
        LogManager.forceLog('MigrationManager', 'migrate', 'start');
        this.syncIndexes();
        const chatId = 862473;

        // await TokenManager.setTokenTags(this.kBonk, ['verified']);
        // await TokenManager.setTokenTags('MEFNBXixkEbait3xn9bkm8WsJzXtVsaJEn4c8Sam21u', ['verified']);
        // await TokenManager.setTokenTags(kUsdcAddress, ['stable']);
        // await TokenManager.setTokenTags(kUsdtAddress, ['stable']);

        // let token = await RedisManager.getToken(kBonk);


        // const tx = await UserTransaction.findOne({ userId: this.kMikeUserId }).sort({ createdAt: -1 }).skip(3);
        // console.log('!mike', 'tx', tx);

        // const swap = await Swap.findOne({ });
        // if (swap){
        //     LogManager.log('MigrationManager', 'migrate', 'swap', swap);
        //     await SwapManager.sendSwapErrorToUser(swap);
        // }

        // await TokenManager.fetchDigitalAsset(this.kBonk);

        // await SubscriptionManager.updateUserSubscription('66fe7b5989633c0aa6dad946');

        // await this.processTx(Chain.SOLANA, '34iFHNe89qhWKGU5cCpx57Jfu995QyTM1y9v3QW9oUKisisdqLeDRLb6dEbbdCaKKJ7P71t3ojPXaDvFabRCLePv'); // jupiter

        // await this.processTx(Chain.SOLANA, '2ntnSu16GoonNQjAF7Ax1F6fDRVRt8JYiSctq75wp49eztfDnSFv9ktjLnbD7ZDpRpPBnoDWAuWNCReHqVvArtLx'); // pumpfun buy
        // await this.processTx(Chain.SOLANA, 'xxBf1LjTesNATcbuebgcPqgRKBbr6CsZmudBQpwLyvkmpC43XsR8JGymG9H5c7QQtLqj8GawEcGVpUVMCuSMbZK'); // pumpfun sell
        // await this.processTx(Chain.SOLANA, '63iupjmC6HBqoQKiQVkQmyooc6368Vr7wnmvQmqFXL6R8YNTaDDwYYrDv9givmeYme1kqLqFNtdv5tNgpJ1ni99U'); // raydium amm sell

        // await this.processTx(Chain.SOLANA, '54Q2VnyP9tLZo3oxCPUpNwxNmZrg32hkmNiDJ4LMEBfxSYAuuBxJuPZrgQESfaxYDPgRZa55CXCKAVEiRruFvNrH'); // jupiter
        // await this.processTx(Chain.SOLANA, '5snNUQUXKY7iJFnaBBv6LjWYuBAryQX3mTdtHorboe6mXrZpv694mXCQucho2W2PDGumsTAqykkqsqhs5FNLuAph'); // MAGIC EDEN AMM
        // await this.processTx(Chain.SOLANA, '26R1Je6V5Pv2g38ejgFbjXm3qQvrC8Qn7TH3pyNMG2QrEdWU2j7Am9vJdCMyNzeyu9wYXMVVNNuM8v5fwMPDfNfA'); // NFT SALE on !!!MAGIC_EDEN_V2
        // await this.processTx(Chain.SOLANA, '42Jybm1JcyGWQx3AAMZffwK3QagUb2RkWgJ3v3bHgoF7vV7xAXuGxiGouNE5K6czPtBNKcAqkY1kcLprmWJwf8Sn');
        // await this.processTx(Chain.SOLANA, '5XuB98XVfwMLLPetV5hzZt65P89WuN4YLTj6NSmz5uoiwc8qpqF2TPPoY8gsPHrFQgQYRWUQTphrU99eQNXTn2HV'); //jupiter

        // await this.processTx(Chain.SOLANA, '33KvrJbdkLMQPPzeex1idWA9A6oUYi7Fkdnf84Mk52UPxA571v65z2JCBwgHBkwfjcY5zmT9iHrC9RFhaHw8kKAE'); // Tensor 
        // await this.processTx(Chain.SOLANA, '2BijsH1TPDuNJbAHZzc1wgEU8p6C2WWpVwhTQZmqR6oEorHL6UPARHi55NFrPPSWE9MFobvNyMGdgczfoDCpS4T8'); // cNFT on Tensor_CNFT
        // await this.processTx(Chain.SOLANA, '5NY9KTmssHEzrqa7ZjBX74PM3w35qruChz2S4B5A5LJFXppTvfgUN7ns7vNqzRiJaoUh8UVStfWdvJWuLU6DezYV'); // TENSOR
        // await this.processTx(Chain.SOLANA, '8cEwWEwEhPFLLkb5VjCouPGcnFhQCCz99BvX2pZCeSnWJraY1oGNadMHdeAtNArfgBwUvhPkGgn7UVUFDQ3NFwG'); // Jupiter Z
        // await this.processTx(Chain.SOLANA, '3S4oBuSpvaYXwZYjbhsdaby5tHAcxPEJjAeErU4UQ6y3nf52vT4BkuUmXRUHUBbgvjGgnE16pDTfAZbwzeB8pA14');

        // await this.processTx(Chain.SOLANA, '3XSLvqS4HYhaSsTkmkakSTLCv4FmfjigGsUGzsRPRRvhDWA8ss3Tek5XTzSygjii8BKncWMX5iu2Bax56Uimreof'); // jupiter

        // await this.processTx(Chain.SOLANA, '42qrQrpjsoicAWmwEYGByAxTUAmoY1ZTx7Gaq15CsN7wVJUekfuEBAebmhTmU5mqEAggRHWCvBXRJyrJP7BsyW6p'); // Stake JUP
        // await this.processTx(Chain.SOLANA, 'RPV6WyK78CHiAakSVYH3xZeqAyojHUpJRcoKKg9sJuEd1VmgG3git1SiCUkviQSSZ1UsrxW1iiW4aGT4bdKRKTu'); // Withdraw JUP from staking
        // await this.processTx(Chain.SOLANA, 'wmwkYgyp3285tRzci9rcYpxYSAUrhSVVBUYHGAxDXDqf1CcTkvnLjfaPqNR8guG4LpCaUT8tCuaw9hWyQHbkXdH'); // Unstake JUP
        // await this.processTx(Chain.SOLANA, '3cPFBSS3p7VpDAn5nnXJ8UQx9wSCa8YaQTja17Mqp1KNi8oBnBCdPD253wNuo2AC7nY1hW2RXrzJparXGqqV8tGW')

        // Metaora DLMM 
        // await this.processTx(Chain.SOLANA, '4cYXQRVdVTWzTwU3ZcjBDRZHko3iLKsuJqThNmxuj4Njd4oC7faj2dvhBxYxrMdCnEzNETMduyvFECQVjYNhZgF8'); // Meteora DLMM swap
        // await this.processTx(Chain.SOLANA, '62zkFyUB6DAhpnZtsKaUVNpdTyNRi1GBUjwgDvYz6tUiZt5GfUnJFrimeBnttHMfBaHK3iTxkC8EZcRUCajB9NhW');
        // await this.processTx(Chain.SOLANA, '2JbwRCQ8cBF5tYkPRXP8G5wDeX2FKqRgVhLH6AZNYVHGjFaMKmbDykJiqRo2FAQdoGDAfUQHV38cXNbNK2rq28cL'); // Meteora DLMM remove LP

        // Meteora Pool
        // await this.processTx(Chain.SOLANA, '9zMP5NXui55L4V5vJsaTSfBk918JgZkHuPRVynoAZk7uMKqTUnwxwqqehgZqvjEtdyuMN2KnXVDgoXRrHQYuVKH'); // swap    
        // await this.processTx(Chain.SOLANA, '3Fyw9GPLXjmQrbpRLCKEs6qab3jF961ciCzdNhR1fadf6w3ruJTeXiSCEACNfnhyJmGQkoeA2ULQt8SMiZzaKcYM');

        // RAYDIUM CPMM
        // await this.processTx(Chain.SOLANA, '5xhE3xMkvpTTb4Btro4xdo3k1yDCdaYrktKr7Cd85NYBFVHhSpDGNEVr58HdymBE9ncZ1sCJoFApHu5qNuLh9duN');
        // await this.processTx(Chain.SOLANA, '5iczX6D2Vt3vBjee5YKkduQkDKUiFvSoT3j7THpscq4Z3jA52JBHbTyb9QxtRFR1WVCFfoevfPERpKQoUajbMF8v');

        // ORCA
        // await this.processTx(Chain.SOLANA, '5d63LQj5GJqBktRqXFyMiWF94jAWAEMGkREEXv1vcVX3VqbrEGUnm8kSZdUQHXLYkEEKTZFMspBwrFQEe23KgsbM');
        // await this.processTx(Chain.SOLANA, '2nQpZR4uktL3hpNdVbb99TDUAJ22oR5PdKmqPvrgXCMAnLjKESn261Zh3Fis19BqQpkBqNsNWtC1vq8TT5whPyLi'); // twoHopSwap

        // JUP GOVERNANCE
        // await this.processTx(Chain.SOLANA, 'uqLicPM7YydwbaJVzUxsMjgrGT6UZ66HD8bQKf4Ni4BRYu1bLWkk99mznReRcche6TsnnoX3bK1oP5pv7eq7A8W'); // vote
        // await this.processTx(Chain.SOLANA, '2Pdx6zxchz5S1RnCG5kVTy4GXAdupVCsN6DegnXirx4sV736kuH4kjEfL8jYJGBSZuwYrsE4FL9RSg1gguD8dVTh'); // vote

        // JUPITER LIMIT ORDERS
        // await this.processTx(Chain.SOLANA, 'WV1AQhJNXPTvnvw7inFkiFPNtnPPixCjY5WnGZ1f2HUCYkupT9t3FY1AAUckpvAVe9DihNyK5YY294fx3KzshSe'); // limit order created
        // await this.processTx(Chain.SOLANA, '62fk1A3YEKvrhoU2Tk4Wjn9xXZ74NF7NWboLQgwCuFcNUjsKCSTG3d8psPeUVrahPq2xxeUAqtRK9GW8U7411YDH'); // limit order created
        // await this.processTx(Chain.SOLANA, '4NtiB2hgavCecDDtDkGqBTDUNZh6oMheQbepTPJaw1FiJwCb7zPvY1WhpvPyLKuKfR5mhL9WvXgrMWCQSrTbSVmU'); // cancel limit order
        // await this.processTx(Chain.SOLANA, '4JiKZEKCVGHZQQmoWptY78Cnuam53q83m9hbFeRiqTzxkmgsFmzbhyxVF13GDfmr4hQ7zgTfiNTNzQrmKzi2ES3S'); // fill limit order

        // GO FUND MEME
        // await this.processTx(Chain.SOLANA, '2k4dMaxXiN6Qs6z9kadGjyqvSDJdVCWEZyVBSe9rChDqo3o3KUVXbrvQPCuh9kEae4Bom55oMaCqmSHVXyVhj4gs'); // go fund meme - buy
        // await this.processTx(Chain.SOLANA, '3p7j3ggDGvSFmhvxQ4wVE8QTWX7JdkXbGJ2uuXvbS3otoxv71mYo6kPbvgLRvtvPxwmoHqELKig22SZVeTHaVZ1W'); // go fund meme - sell

        // PUMPSWAP
        // await this.processTx(Chain.SOLANA, '2PZmsmcekxhTh1xCatopVuS1W32j8178zZRJZBpNGnUXBabnxo2TbkbhixA7xTgpnhz4DzYXQkPhqcpbPLtyYxUs'); // swap
        // await this.processTx(Chain.SOLANA, '5XjvUxArVST3p6wpF6JnwboAgbJohVq3AKXrCisotNreZVMrxm7aARgtuS4U7F1XWWCpc5BVn732hQSoNb7izeoo'); // add lp
        // await this.processTx(Chain.SOLANA, '3aKCXa39t1ma32pzdWqa2wzYrmc1L9z8KBj9V9Tf1bUpLemeSghQ4Q3hFEXwk7ZKcSXnLPji6cr6v9Nq2RMhkzWw'); // withdraw lp        

        // SONIC SVM
        // await this.processTx(Chain.SONIC, '5V9cB7VyDQANcEMG5QLH67uqsobDC1tYhivra93GU88HZVgrsRRtuJpbCbAwikwCyhh58EoEfQWUvsiigJMfpWuv'); // stake
        // await this.processTx(Chain.SONIC, '4g4KAqWS4jNYhSgWWVu8CnG5Si9YUASWVY4GaMYGNHcYtkjeFVLr7NgbuoF6f73FqqNera6iCg3x4yiApVkxFBMW'); // SWAP on SEGA
        // await this.processTx(Chain.SONIC, '24ER3mdG69QTAFoUuVyrQSyDLLYw1JeNtRPzQikorEqgjbaqDniFyfMZE7nCynsC77Bo1wAuuJ7o4J6fshbZg7bf'); // ADD LIQUIDITY on SEGA
        // await this.processTx(Chain.SONIC, '66mhhqK9UzBWtqriYNTRqUnBw1BYopKDK8ZwSgrhTemTBBws4GLhj6AHHZP94xru7KKgenUHQUPYsJHXiKjpRms'); // REMOVE LIQUIDITY on SEGA
        // await this.processTx(Chain.SONIC, 'ZbT3Zo1qifBN8mQD9M2cJdL7uYAoDuixPzbPkXfUd5UmneyFdmCaK48XCL5mUbYGmVw1UYy9jD8t6tf2ftFfY5R'); // SWAP on SEGA
    
        // KAMINO LIMIT ORDER
        // await this.processTx(Chain.SOLANA, '512DGPGZFr98QwLCbgXvJcspQBvnAueVyywwjK6uSp2P7j3CEqCsgfpjr14xuoFx37udhLZYw6B8SNfzNrFNdzW1'); // CREATE LIMIT ORDER
        // await this.processTx(Chain.SOLANA, 'j1zW8KvKiPY5GPrpygYgfuqd9pqnUh5vbWUHaCggpTrvzRou6k3UeHcH2AR6K3QS59ZgYp1V6Gu8VbqhfMNfh63'); // CANCELED LIMIT ORDER
        // await this.processTx(Chain.SOLANA, '5212dMLK5n1EGiGcfBG6gwfjkzY1tiUnBdi6ZhKiV8QAZoE3hUM7Wnb6D6EGx5YS49dPTk3Km4ijLEmNkHSnUxcx'); // FILLED ORDER
        // await this.processTx(Chain.SOLANA, ''); // START FILLING ORDER
        // await this.processTx(Chain.SOLANA, ''); // END FILLING ORDER

        // TITAN DEX
        // await this.processTx(Chain.SOLANA, '55FqEG5gr7bKADuH6oy539qbDwyfBVdNSif3c57pXE8kX6Tkz3KC1g9cvkKAjJa9HsAkXDuUGoTxaG8akhRfdYPu'); // swap

        // RAYDIUM CLMM
        // await this.processTx(Chain.SOLANA, '3Appnyjw6zUSAF4seJpvvymQQFLu3CazksHMdfNVujQ17kXDkbWgnWvSZYJqPw2cj1KfiUfuGLF1tEPzCHoS4Dzi'); // swapV2
        // await this.processTx(Chain.SOLANA, '3Ly43U46SPBVkZYf1pAndHD17dL2nPAJUWYGjonBPMnPDAVLKntWQwNocEioQPW8Mm89QUovnnmXLDP4oVEyKbHt'); // swap

        // COBALTX
        // await this.processTx(Chain.SVMBNB_MAINNET, '2vpxxNevRE5qyU6mwbgx5wAwCedTxPVP2MnG2E8hGz3pzPgDt9z7rBrztXFtZUGuQVHXSxrZqhjN1Dg4tcCuGhtf'); // CobaltX
        // await this.processTx(Chain.SOON_MAINNET, '3QGVcZJduS7pK3RzDUVZcd7zr9FF776ZDK5duKZVYVsE4mdMuT4ufSyP8HEccSupb1E7QtZeKbpZWbZDPN6rcpsw'); // CobaltX

        // const digitalAssets = await MetaplexManager.fetchAllDigitalAssets(Chain.SONIC, [
        //     'mrujEYaN1oyQXDHeYNxBYpxWKVkQ2XsGxfznpifu4aL', 
        //     'HbDgpvHVxeNSRCGEUFvapCYmtYfqxexWcCbxtYecruy8'
        // ]);
        // console.log('SONIC digitalAssets:', digitalAssets);

        // const digitalAssets = await MetaplexManager.fetchAllDigitalAssets(Chain.SOLANA, [this.kBonk]);
        // console.log('BONK digitalAssets:', digitalAssets);


        // const connection = newConnection(undefined);
        // for (let index = 0; index < 200; index++) {
        //     this.ddos(connection, index);
        // }  

        // const mint = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
        // const tokenName = 'BONK';

        // await BotManager.sendMessage({
        //     chatId, 
        //     text: 'BONK BONK BONK 🔥🔥🔥',
        //     inlineKeyboard
        // });
        
        // await this.migrateValidators();
        // await this.findTransactionsWithoutDescription();
        
        // await this.migrateUserEnginesToTraderProfiles();

        // await this.testGeyserTx();

        // await this.mongoExport();
        // await this.mongoImport();

        // process.on("unhandledRejection", (reason) => {
        //     LogManager.error('!mike', "Unhandled rejection detected:", reason);
        //     // This can kill Node depending on your configuration,
        //     // so you must fix whatever code triggers the unhandled rejection.
        // });

        // const svm = new SvmManager(Chain.SONIC);
        // await svm.subscribe();
        // const svm = new SvmManager(Chain.SONIC_TESTNET);
        // await svm.subscribe();
        // const svm = new SvmManager(Chain.SVMBNB_MAINNET);
        // await svm.subscribe();

        // if (EnvManager.isCronProcess){
        //     let countUsers = 0;
        //     const users = await User.find({ });
        //     for (const user of users) {
        //         try {
        //             const traders = await TraderProfilesManager.getUserTraderProfiles(user.id);
        //             if (traders.length == 0){
        //                 // console.log('!mike', 'traders', traders);
        //                 countUsers++;
                        
        //                 await TraderProfilesManager.createTraderProfile(user, SwapManager.kNativeEngineId, 'Wallet 1', Priority.MEDIUM);
        //             }
        //         }
        //         catch (error) {
        //             LogManager.error('!mike', 'error', error);
        //         }
        //     }
        //     console.log('!mike', 'countUsers', countUsers);
        // }

        // const poolInfo: any = await RaydiumManager.getAmmPoolInfo(Chain.SOLANA, 'HVNwzt7Pxfu76KHCMQPTLuTCLTm6WnQ1esLv4eizseSv');
        // console.log('!mike', 'poolInfo', JSON.stringify(poolInfo));
        // console.log('!mike', 'baseDecimal:', poolInfo?.baseDecimal.toString(), 'quoteDecimal:', poolInfo?.quoteDecimal.toString());
        // if (poolInfo){
        //     for (const key in poolInfo) {
        //         const element = poolInfo[key];
        //         console.log('!mike',  key, '=', element.toString());
        //     }
        // }


        // await SolanaManager.getRecentBlockhash(Chain.SOLANA);
        // const userId = process.env.ENVIRONMENT === 'PRODUCTION' ? '66eefe2c8fed7f2c60d147ef' : '66ef97ab618c7ff9c1bbf17d';
        // const traderProfile = await TraderProfilesManager.getUserDefaultTraderProfile(userId);
        // if (!traderProfile){
        //     LogManager.error('!mike', 'traderProfile not found');
        //     return;
        // }
        // const { signature, swap } = await SwapManager.initiateBuy(user, Chain.SOLANA, SwapDex.RAYDIUM_AMM, traderProfile.id, this.kChillGuy, 0.005, true);
        // console.log('signature:', signature, 'swap:', swap);
        // const { signature, swap } = await SwapManager.initiateSell(user, Chain.SOLANA, SwapDex.RAYDIUM_AMM, traderProfile.id, this.kBonk, 10, true);
        // console.log('signature:', signature, 'swap:', swap);

        // const prices = await TokenPriceManager.getTokensPrices(Chain.SOLANA, [this.kBonk, this.kChillGuy, kSolAddress]);
        // console.log('!mike', 'prices', prices);

        // const prices = await HeliusManager.getTokensPrices(Chain.SOLANA, [this.kBonk, this.kChillGuy, kSolAddress]);
        // console.log('!mike', 'prices', prices);

        // if (EnvManager.isCronProcess){
        //     await this.migrateRefCodes();
        // }

        // await Swap.updateOne({ _id: '67f438630154b03dcc3e2981' }, { $set: { 'status.type': StatusType.PROCESSING } });
        // await SwapManager.receivedConfirmationForSignature(Chain.SOLANA, '3RhN1fz6KpzjmbJeCmZt81k1ZDErsjG9GwRx3a5FVqsq9pjjMewkShsSGWkG6HAmJBgmqjgFiEnqN3AujyrzZRa3');

        // await ReferralsManager.recalcUserRefStats(this.kMikeUserId);
    
        // if (EnvManager.isCronProcess){
        //     await ReferralsManager.recalcRefStats();
        //     await ReferralsManager.processRefPayouts();
        // }

        // await ReferralsManager.recalcRefStats(true);
        // await ReferralsManager.checkIfFeeWalletHasEnoughUnpaidFunds();
        
        // const laserstream = new LaserstreamManager();
        // await laserstream.subscribe();

        //run every 10 seconds
        // setInterval(async () => {
        //     const stats: { pubkey: string, count: number, perMinute: number }[] = [];
        //     for (const pubkey in YellowstoneManager.walletsStats) {
        //         const count = YellowstoneManager.walletsStats[pubkey];
        //         const perMinute = Math.floor(count / ((Date.now() - YellowstoneManager.walletsStatsStartDate.getTime()) / 1000 / 60));
        //         stats.push({ pubkey, count, perMinute });
        //     }
        //     stats.sort((a, b) => b.count - a.count);
        //     console.log('!geyser stats', stats);
        // }, 10 * 1000);

        // if (EnvManager.isCronProcess){
        //     await UserManager.checkUsersWhoHasBlockedBot();
        // }

        // await TokenManager.refreshHotTokens();
        
        // await EventsManager.createSoonEvent();
        // const event = await EventsManager.getActiveEvent();
        // if (event){
        //     console.log('MigrationManager', 'migrate', 'active event found', event);
        // }
        // else {
        //     console.log('MigrationManager', 'migrate', 'no active event found');
        // }

        // const event = await EventsManager.getActiveEvent();
        // if (event){
        //     await EventsManager.recalculateLeaderboard(event.id);
        // }

        LogManager.forceLog('MigrationManager', 'migrate', 'done');
    }

    static async migrateRefCodes(){
        console.log('migrate ref codes');

        await UserRefCode.deleteMany({});
        await UserRefClaim.deleteMany({});
        await User.updateMany({}, { $unset: { referralCode: "" } });

        const users = await User.find({ referralCode: { $exists: false } });
        console.log('migrate ref codes', 'users.length:', users.length);

        for (const user of users) {
            await ReferralsManager.createReferralCode(user, true);
        }
    }

    static async testGeyserTx() {
        const jsonString = fs.readFileSync('test_tx.json', "utf8");
        const chain = Chain.SOLANA;
        const signature = '5kSaebxQ9LA9rDLaDMThpEHLtf1s3gHmgB6sRUaaR2ZdewWzdLQLsNPaHDkFTAg2GpFqb3TF5rjZjeRMTsZ4j98Q';

        await UserTransaction.deleteMany({ signature });

        const geyserData = JSON.parse(jsonString);
        
        geyserData.transaction.transaction.signature = Buffer.from(geyserData.transaction.transaction.signature);
        const signatures: Buffer[] = [];
        for (const signature of geyserData.transaction.transaction.transaction.signatures){
            signatures.push(Buffer.from(signature));
        }
        geyserData.transaction.transaction.transaction.signatures = signatures;

        const accountKeys: Buffer[] = [];
        for (const accountKey of geyserData.transaction.transaction.transaction.message.accountKeys){
            accountKeys.push(Buffer.from(accountKey));
        }
        geyserData.transaction.transaction.transaction.message.accountKeys = accountKeys;

        for (const instruction of geyserData.transaction.transaction.transaction.message.instructions){
            if (instruction.data) instruction.data = Buffer.from(instruction.data);
            if (instruction.accounts) instruction.accounts = instruction.accounts.data;
        }

        geyserData.transaction.transaction.transaction.message.recentBlockhash = Buffer.from(geyserData.transaction.transaction.transaction.message.recentBlockhash);

        const parsedTransactionWithMeta = await TxParser.parseGeyserTransactionWithMeta(geyserData);
        LogManager.log('!parsedTransactionWithMeta', parsedTransactionWithMeta);
        if (parsedTransactionWithMeta){
            WalletManager.processWalletTransaction(chain, parsedTransactionWithMeta, 'SHYFT0');
        }
    }

    static async ddos(connection: web3.Connection, index: number) {
        const balance = await connection.getBalance(new PublicKey('GPBu4QznMR9QrWVvdeAthimaGRU35zDQjom5PUNM7kek'));
        LogManager.log(new Date(), 'index', index, 'balance', balance);

    }

    static async migrateUserEnginesToTraderProfiles() {
        const users = await User.find({ engine: { $exists: true } });
        LogManager.log('MigrationManager', 'migrateUserEnginesToTraderProfiles', 'users', users.length);

        for (const user of users) {
            const engineId = user.engine;
            if (!engineId) {
                continue;
            }

            const engine = SwapManager.engines.find((e) => e.id === engineId);
            if (!engine) {
                LogManager.error('MigrationManager', 'migrateUserEnginesToTraderProfiles', 'engine not found', engineId);
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

            LogManager.log('MigrationManager', 'migrateUserEnginesToTraderProfiles', 'userId', user.id, 'engineId', engine.id, engine.title, 'trader profile created');
        }
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
        await LpMint.syncIndexes();
        await UserRefReward.syncIndexes();
        await UserRefCode.syncIndexes();
        await UserRefPayout.syncIndexes();
        await Config.syncIndexes();
        await HotToken.syncIndexes();
        await Swap.syncIndexes();
        await TradingEvent.syncIndexes();
        await TradingEventPoints.syncIndexes();
    }

    static async processTx(chain: Chain, signature: string) {
        const connection = newConnectionByChain(chain);

        const userId = process.env.ENVIRONMENT === 'PRODUCTION' ? '66eefe2c8fed7f2c60d147ef' : '66ef97ab618c7ff9c1bbf17d';

        await RedisManager.cleanUserTransactions(userId);
        await UserTransaction.deleteOne({ signature, userId });

        const wallets = await Wallet.find({ userId: userId, status: {$in: [WalletStatus.ACTIVE, WalletStatus.TRADER]} });
        const user = await UserManager.getUserById(userId, true);
        if (!user){
            LogManager.error('!mike', 'user not found', userId);
            return;
        }
        const chats = [{user, wallets}];
        // LogManager.log('!!!wallets', wallets.map((wallet) => wallet.walletAddress));
        const tx = await SolanaManager.getParsedTransaction(chain, signature);
        // LogManager.log('!tx', JSON.stringify(tx));
        if (tx){
            await WalletManager.processTxForChats(chain, signature, tx, chats, 'test');
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

    static async mongoExport(){
        // get list of collections in mongodb
        // export each collection to json file

        if (!mongoose.connection.db){
            LogManager.error('mongoExport: No db connection');
            return;
        }

        const collections = await mongoose.connection.db.listCollections().toArray();
        const names = collections.map((collection: any) => collection.name);
        console.log('collections', names);

        const connectionUrl = process.env.MONGODB_CONNECTION_URL!;
        const lines: string[] = [];
        for (const collectionName of names) {
            const command = `mongoexport --uri="${connectionUrl}" --collection=${collectionName} --out=${collectionName}.json`;
            lines.push(command);
        }

        fs.writeFileSync('files/mongoexport.sh', lines.join('\n'));
        

    }

    static async mongoImport(){
        // get list of collections in mongodb
        // export each collection to json file

        if (!mongoose.connection.db){
            LogManager.error('mongoImport: No db connection');
            return;
        }

        const collections = await mongoose.connection.db.listCollections().toArray();
        const names = collections.map((collection: any) => collection.name);
        console.log('collections', names);

        const connectionUrl = process.env.MONGODB_CONNECTION_URL!;
        const lines: string[] = [];
        for (const collectionName of names) {
            const command = `mongoimport --uri="${connectionUrl}" --collection=${collectionName} --file=${collectionName}.json`;
            lines.push(command);
        }

        fs.writeFileSync('files/mongoimport.sh', lines.join('\n'));
        

    }

}