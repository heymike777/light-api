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

export class MigrationManager {

    static async migrate() {
        console.log('MigrationManager', 'migrate', 'start');

        // await ProgramManager.fetchIDLs();

        // await Program.updateMany({}, { $set: { chain: Chain.SOLANA } });

        // const connection = newConnection();
        // const signature = 'WhUkiDwcuYpzzE1wVrp4hxhaJm6mU2VBgx7veSXEkSSd2W2ZbK3vFPuMzeTnNnCmy5CM7RJTXY2ah2Hg6rhRUGw';
        // const tx = await SolanaManager.getParsedTransaction(connection, signature);
        // console.log('MigrationManager', 'migrate', 'tx:', JSON.stringify(tx, null, 2));

        // if (!tx || !tx.meta){
        //     console.error('MigrationManager', 'migrate', 'tx not found');
        //     process.exit(1);
        // }

        // const wallets = await Wallet.find();
        // const chats: {id: number, wallets: IWallet[]}[] = [{ id: 862473, wallets: wallets }];

        // for (const chat of chats) {
        //     let message = `[<a href="${ExplorerManager.getUrlToTransaction(signature)}">TX</a>]\n\n`;

        //     let accountIndex = 0;
        //     for (const account of tx.transaction.message.accountKeys) {
        //         const wallet = chat.wallets.find((w) => w.walletAddress == account.pubkey.toBase58());
        //         if (wallet){
        //             const walletTitle = wallet.title || wallet.walletAddress;
        //             message += `<a href="${ExplorerManager.getUrlToAddress(wallet.walletAddress)}">${walletTitle}</a>:\n`;

        //             const tokenBalances: { accountIndex: number, mint?: string, balanceChange: number, pre: TokenBalance | undefined, post: TokenBalance | undefined }[] = [];

        //             if (tx.meta.preTokenBalances || tx.meta.postTokenBalances){
        //                 const accountIndexes: number[] = [];
        //                 //     ...(tx.meta.preTokenBalances ? tx.meta.preTokenBalances.filter((b) => b.owner == account.pubkey.toBase58()) : []),
        //                 //     ...(tx.meta.postTokenBalances ? tx.meta.postTokenBalances.filter((b) => b.owner == account.pubkey.toBase58()) : [])
        //                 // ]

        //                 if (tx.meta.preTokenBalances){
        //                     for (const preTokenBalance of tx.meta.preTokenBalances) {
        //                         if (preTokenBalance.owner == account.pubkey.toBase58() && !accountIndexes.includes(preTokenBalance.accountIndex)){
        //                             accountIndexes.push(preTokenBalance.accountIndex);
        //                         }
        //                     }
        //                 }
        //                 if (tx.meta.postTokenBalances){
        //                     for (const postTokenBalance of tx.meta.postTokenBalances) {
        //                         if (postTokenBalance.owner == account.pubkey.toBase58() && !accountIndexes.includes(postTokenBalance.accountIndex)){
        //                             accountIndexes.push(postTokenBalance.accountIndex);
        //                         }
        //                     }
        //                 }

        //                 for (const accountIndex of accountIndexes){
        //                     const preTokenBalance = tx.meta.preTokenBalances?.find((b) => b.accountIndex == accountIndex);
        //                     const postTokenBalance = tx.meta.postTokenBalances?.find((b) => b.accountIndex == accountIndex);
        //                     const mint = preTokenBalance?.mint || postTokenBalance?.mint || undefined;

        //                     const preBalance = new BN(preTokenBalance?.uiTokenAmount.amount || 0);
        //                     const postBalance = new BN(postTokenBalance?.uiTokenAmount.amount || 0);
        //                     const balanceDiff = postBalance.sub(preBalance);
        //                     const lamportsPerToken = 10 ** (preTokenBalance?.uiTokenAmount.decimals ||postTokenBalance?.uiTokenAmount.decimals || 0);
        //                     const { div, mod } = balanceDiff.divmod(new BN(lamportsPerToken));
        //                     const balanceChange = div.toNumber() + mod.toNumber() / lamportsPerToken;


        //                     tokenBalances.push({ accountIndex, mint, balanceChange, pre: preTokenBalance, post: postTokenBalance });
        //                 }
        //             }

        //             const nativeBalanceChange = tx.meta.preBalances[accountIndex] - tx.meta.postBalances[accountIndex];
        //             const wsolBalanceChange = tokenBalances.find((b) => b.mint == kSolAddress)?.balanceChange || 0;                    
        //             if (nativeBalanceChange != 0 || wsolBalanceChange != 0){
        //                 message += `SOL: ${Helpers.prettyNumber(nativeBalanceChange / LAMPORTS_PER_SOL + wsolBalanceChange, 3)}\n`;
        //             }

        //             for (const tokenBalance of tokenBalances) {
        //                 const mint = tokenBalance.pre?.mint || tokenBalance.post?.mint || undefined;
        //                 if (mint && mint != kSolAddress){
        //                     const balanceChange = tokenBalance.balanceChange;
        //                     const tokenName = Helpers.prettyWallet(mint);
        //                     message += `<a href="${ExplorerManager.getUrlToAddress(mint)}">${tokenName}</a>: ${balanceChange}\n`;            
        //                 }
        //             }

        //         }
        //         accountIndex++;
        //     }

        //     //TODO: add info about token and BUY/SELL buttons

        //     // BotManager.sendMessage(chat.id, message);
        //     console.log(message);
        // }


        // process.exit(0);


        console.log('MigrationManager', 'migrate', 'done');
    }

}