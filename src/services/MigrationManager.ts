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

        // const signature = '5NhaByTrpzrGhdg7gNqbrucvihV9Vc9gJ77jvqabpiZrhb3sossjkefu4s5qPzwM8ny2LFSmGW2Z8vaBAijy1g16'; // NFT purchase on Tensor
        // const signature = '4R6NJAPRFC41cXUWvtmpr7o44c9XFMuDvGGNGVRQG1CWQHyD4PdJqiY8dXaaC4NKZdEwT9VHeJWSR4mr96NmhUpw'; // just a simple transfer
        // const signature = 'jWCom8wCbHneiKvAHomawtxvLeRAXrvokBfG12Hdp4Fmd9Mc6MmasF8ZmhEeuDrFn9zmttsyKF8Ubq64rVJMeiL'; // bought cNFT on tensor
        // const signature = '5WjDsagDsf7mgCuxo7xHJUPEqiHKb45nf6j3z7vdptEKKgfG6rHU2vzMkaT2zhndB7r7bLFsdEVfy1MRabzQz4WE';

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

        console.log('MigrationManager', 'migrate', 'done');
    }

}