import nacl from "tweetnacl";
import * as web3 from '@solana/web3.js';
import * as spl from '@solana/spl-token';
import { getRpc, newConnection } from "./lib/solana";
import axios from "axios";
import { Priority, WalletModel } from "./types";
import base58 from "bs58";
import { HeliusManager } from "./HeliusManager";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { TransactionMessage } from "@solana/web3.js";
import { JitoManager } from "./JitoManager";
import { Keypair } from "@solana/web3.js";
import { Helpers } from "../helpers/Helpers";

export interface CreateTransactionResponse {
    tx: web3.Transaction,
    blockhash: web3.BlockhashWithExpiryBlockHeight,
}

export interface TokenBalance {
    amount: number;
    uiAmount: number;
    decimals?: number;
    ataPubKey?: web3.PublicKey;
}

export type SendThrough = {
    priority?: Priority;
    useJito?: boolean,
    useHelius?: boolean,
    useTriton?: boolean,
}

export class SolanaManager {

    static verify(message: string, walletId: string, signature: string): boolean {
        try {
            return this.verifyMessage(message, walletId, signature);
        }
        catch (error){
            console.error(error);
        }

        try {
            const transaction = web3.Transaction.from(Buffer.from(JSON.parse(signature)));

            let isVerifiedSignatures = transaction.verifySignatures();

            if (!isVerifiedSignatures) {
                return false;
            }

            for (const sign of transaction.signatures) {
                if (sign.publicKey.toBase58() == walletId){
                    return true;
                }
            }            
        }
        catch (error){
            console.error(error);
        }

        return false;
    }

    
    static verifyMessage(message: string, walletId: string, signature: string): boolean {
        const messageBytes = new TextEncoder().encode(message);
            
        const publicKeyBytes = base58.decode(walletId);
        const signatureBytes = base58.decode(signature);

        return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    }

    static async partialSignAndSend(web3Conn: web3.Connection, transaction: web3.Transaction, privateKey?: web3.Keypair): Promise<string | undefined> {
        if (privateKey){
            transaction.partialSign(privateKey);
        }

        let isVerifiedSignatures = transaction.verifySignatures();

        const signatures = transaction.signatures;
        for (const signature of signatures) {
            if (!signature.signature){
                console.log(new Date(), process.env.SERVER_NAME, signature.publicKey.toBase58(), 'have not signed!!!');
            }
        }

        console.log(new Date(), process.env.SERVER_NAME, 'isVerifiedSignatures', isVerifiedSignatures);

        if (isVerifiedSignatures){
            // console.log(new Date(), process.env.SERVER_NAME, '!transaction', transaction);
            const wireTransaction = transaction.serialize();
            const signature = await web3Conn.sendRawTransaction(wireTransaction, {skipPreflight: false});    
            console.log(new Date(), process.env.SERVER_NAME, 'signature', signature);
            return signature;    
        }
    
        return undefined;
    }

    static async isBlockhashValid(blockhash: string) : Promise<boolean | undefined> {
        //console.log(new Date(), process.env.SERVER_NAME, '----- isBlockhashValid -----', blockhash);
        const { data } = await axios.post(getRpc(), {
            "id": 45,
            "jsonrpc": "2.0",
            "method": "isBlockhashValid",
            "params": [
                blockhash,
                {
                    "commitment": "finalized"
                }
            ]
        });

        const value = data?.result?.value;

        return (value==true || value==false) ? value : undefined;
    }

    static async getRecentPrioritizationFees() : Promise<number | undefined> {
        //console.log(new Date(), process.env.SERVER_NAME, '----- isBlockhashValid -----', blockhash);
        const { data } = await axios.post(getRpc(), {
            "id": 1,
            "jsonrpc": "2.0",
            "method": "getRecentPrioritizationFees",
            "params": []
        });

        const value = data?.result;

        console.log(new Date(), process.env.SERVER_NAME, 'getRecentPrioritizationFees', value);

        return undefined;
    }

    static createWallet(): WalletModel {
        const keyPair = web3.Keypair.generate();

        return {
            publicKey: keyPair.publicKey.toString(),
            privateKey: base58.encode(Array.from(keyPair.secretKey)),
        }
    }

    static async isTransactionContainSigner(transaction: web3.Transaction, signerAddress: string, hasToBeSigned: boolean = true): Promise<boolean> {
        for (const signature of transaction.signatures) {
            if (signature.publicKey.toBase58() == signerAddress){
                if (!hasToBeSigned) { return true; }
                else if (hasToBeSigned && signature.signature){ return true; }
            }
        }

        return false;
    }
    
    static async createSplTransferInstructions(web3Conn: web3.Connection, splTokenMintPublicKey: web3.PublicKey, amount: number, decimals: number, fromPublicKey: web3.PublicKey, toPublicKey: web3.PublicKey, feePayerPublicKey: web3.PublicKey): Promise<web3.TransactionInstruction[]>{
        const fromTokenAddress = await spl.getAssociatedTokenAddress(splTokenMintPublicKey, fromPublicKey);
        const toTokenAddress = await spl.getAssociatedTokenAddress(splTokenMintPublicKey, toPublicKey);
        const instructions: web3.TransactionInstruction[] = [];

        const instruction1 = await this.getInstrucionToCreateTokenAccount(web3Conn, splTokenMintPublicKey, fromTokenAddress, fromPublicKey, feePayerPublicKey);
        if (instruction1 != undefined){
            instructions.push(instruction1);
        }

        const instruction2 = await this.getInstrucionToCreateTokenAccount(web3Conn, splTokenMintPublicKey, toTokenAddress, toPublicKey, feePayerPublicKey);
        if (instruction2 != undefined){
            instructions.push(instruction2);
        }

        instructions.push(
            spl.createTransferInstruction(
                fromTokenAddress, 
                toTokenAddress, 
                fromPublicKey, 
                Math.floor(amount * 10**decimals)
            )
        );
    
        return instructions;
    }  

    static async createSplAccountInstruction(tokenMintPublicKey: web3.PublicKey, walletPublicKey: web3.PublicKey, feePayerPublicKey: web3.PublicKey, tokenAddress?: web3.PublicKey): Promise<web3.TransactionInstruction>{
        if (!tokenAddress){
            tokenAddress = await spl.getAssociatedTokenAddress(tokenMintPublicKey, walletPublicKey);
        }

        console.log(new Date(), process.env.SERVER_NAME, 'createSplAccountInstruction', 'tokenAddress', tokenAddress.toBase58());
        return spl.createAssociatedTokenAccountInstruction(
            feePayerPublicKey,
            tokenAddress,
            walletPublicKey,
            tokenMintPublicKey,
            spl.TOKEN_PROGRAM_ID,
            spl.ASSOCIATED_TOKEN_PROGRAM_ID
        );    
    }  

    static async createSolTransferInstruction(fromPublicKey: web3.PublicKey, toPublicKey: web3.PublicKey, lamports: number): Promise<web3.TransactionInstruction> {
        return web3.SystemProgram.transfer({
            fromPubkey: fromPublicKey,
            toPubkey: toPublicKey,
            lamports: lamports,
        });
    }

    static async getInstrucionToCreateTokenAccount(
        web3Conn: web3.Connection, 
        tokenMintPublicKey: web3.PublicKey, 
        tokenAccountAddressPublicKey: web3.PublicKey, 
        ownerAddressPublicKey: web3.PublicKey, 
        feePayerPublicKey: web3.PublicKey
    ): Promise<web3.TransactionInstruction | undefined> {

        try {
            const account = await spl.getAccount(
                web3Conn, 
                tokenAccountAddressPublicKey, 
                undefined, 
                spl.TOKEN_PROGRAM_ID
            );
        } catch (error: unknown) {
            if (error instanceof spl.TokenAccountNotFoundError || error instanceof spl.TokenInvalidAccountOwnerError) {
                return spl.createAssociatedTokenAccountInstruction(
                    feePayerPublicKey,
                    tokenAccountAddressPublicKey,
                    ownerAddressPublicKey,
                    tokenMintPublicKey,
                    spl.TOKEN_PROGRAM_ID,
                    spl.ASSOCIATED_TOKEN_PROGRAM_ID
                );
            } else {
                throw error;
            }
        }
    }

    static async closeEmptyTokenAccounts(web3Conn: web3.Connection, keypair: web3.Keypair): Promise<number | undefined> {
        // Split an array into chunks of length `chunkSize`
        const chunks = <T>(array: T[], chunkSize = 10): T[][] => {
            let res: T[][] = [];
            for (let currentChunk = 0; currentChunk < array.length; currentChunk += chunkSize) {
                res.push(array.slice(currentChunk, currentChunk + chunkSize));
            }
            return res;
        };
        
        // Get all token accounts of `wallet`
        const tokenAccounts = await web3Conn.getParsedTokenAccountsByOwner(keypair.publicKey, { programId: spl.TOKEN_PROGRAM_ID });
        
        // You can only close accounts that have a 0 token balance. Be sure to filter those out!
        const filteredAccounts = tokenAccounts.value.filter(account => account.account.data.parsed.info.tokenAmount.uiAmount >= 0);
        const ataAmount = filteredAccounts.length;

        if (filteredAccounts.length > 0){
            console.log(new Date(), process.env.SERVER_NAME, 'filteredAccounts.length:', filteredAccounts.length);

            const transactions: web3.Transaction[] = [];
            
            const recentBlockhash = (await web3Conn.getLatestBlockhash()).blockhash;
            
            const chunksArr = chunks(filteredAccounts);

            const mainWallet = web3.Keypair.fromSecretKey(bs58.decode(process.env.ROOT_PRIVATE_KEY!));

            for (const chunk of chunksArr) {
                const txn = new web3.Transaction();
                txn.feePayer = mainWallet.publicKey;
                txn.recentBlockhash = recentBlockhash;
                for (const account of chunk) {
                    // Add a `closeAccount` instruction for every token account in the chunk
                    if (account.account.data.parsed.info.tokenAmount.uiAmount > 0) {
                        // console.log('account.account.data.parsed', account.account.data.parsed);
                        const inst = await SolanaManager.createSplTransferInstructions(
                            web3Conn, 
                            new web3.PublicKey(account.account.data.parsed.info.mint), 
                            account.account.data.parsed.info.tokenAmount.uiAmount, 
                            account.account.data.parsed.info.tokenAmount.decimals, 
                            keypair.publicKey, 
                            mainWallet.publicKey, 
                            mainWallet.publicKey
                        );
                        txn.add(...inst);
                    }

                    txn.add(spl.createCloseAccountInstruction(account.pubkey, mainWallet.publicKey, keypair.publicKey));
                }
                transactions.push(txn);
            }


            console.log(new Date(), process.env.SERVER_NAME, 'transactions.length:', transactions.length);
            if (transactions.length > 1) {
                console.log(new Date(), process.env.SERVER_NAME, 'TOO MANY TRANSACTIONS');
                return;
            }

            // Sign and send all transactions
            for (const tx of transactions) {
                try{
                    tx.partialSign(keypair);
                    tx.partialSign(mainWallet)
                    const signedTransaction = await SolanaManager.partialSignAndSend(web3Conn, tx);
                    console.log(new Date(), process.env.SERVER_NAME, 'signedTransaction', signedTransaction);        
                }
                catch (err){
                    console.error('closeEmptyTokenAccounts', err);
                }
                
                //sleep 100 ms
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        return ataAmount;
    }

    static async getWalletSolBalance(web3Conn: web3.Connection, walletAddress: string): Promise<TokenBalance | undefined>{
        try {
            const mainWalletPublicKey = new web3.PublicKey(walletAddress);
            const balance = await web3Conn.getBalance(mainWalletPublicKey);
            return {amount: balance, uiAmount: Math.round(100 * balance / web3.LAMPORTS_PER_SOL) / 100, decimals: 9};
        }
        catch (err){
            console.error('getWalletSolBalance', err);
        }

        return undefined;
    }

    static async getWalletTokenBalance(web3Conn: web3.Connection, walletAddress: string, tokenAddress: string): Promise<TokenBalance>{
        try {
            // console.log(new Date(), process.env.SERVER_NAME, 'getWalletTokenBalance', 'walletAddress', walletAddress, 'tokenAddress', tokenAddress);
            const mainWalletPublicKey = new web3.PublicKey(walletAddress);
            const tokenPublicKey = new web3.PublicKey(tokenAddress);
            const tmp = await web3Conn.getParsedTokenAccountsByOwner(mainWalletPublicKey, {mint: tokenPublicKey});
            // console.log(new Date(), process.env.SERVER_NAME, 'getWalletTokenBalance', 'tmp', JSON.stringify(tmp));

            return {
                amount: +(tmp.value[0].account.data.parsed.info.tokenAmount.amount), 
                uiAmount: +(tmp.value[0].account.data.parsed.info.tokenAmount.uiAmount),
                decimals: tmp.value[0].account.data.parsed.info.tokenAmount.decimals,
                ataPubKey: tmp.value[0].pubkey
            }
        }
        catch (err){
            // console.error('getWalletTokenBalance', err);
        }

        return {amount: 0, uiAmount: 0};
    }

    static async addPriorityFeeToTransaction(transaction: web3.Transaction): Promise<web3.Transaction>{
        const instructions = await this.getPriorityFeeInstructions();
        transaction.add(...instructions);
        return transaction;
    }

    static async getPriorityFeeInstructions(): Promise<web3.TransactionInstruction[]> {
        const feeEstimate = await HeliusManager.getRecentPrioritizationFees();
        return [
            web3.ComputeBudgetProgram.setComputeUnitPrice({
                microLamports: feeEstimate,
            })
        ];
    }
    
    static async createTransaction(feePayer: web3.PublicKey, blockhash?: string, addPriorityFee: boolean = true): Promise<web3.Transaction> {
        let transaction = new web3.Transaction();
        transaction.feePayer = feePayer;
        if (blockhash) { transaction.recentBlockhash = blockhash; }
        if (addPriorityFee) { transaction = await this.addPriorityFeeToTransaction(transaction); }
        return transaction;
    }

    static async createVersionedTransaction(instructions: web3.TransactionInstruction[], keypair: web3.Keypair, blockhash?: string, addPriorityFee: boolean = true): Promise<web3.VersionedTransaction> {
        if (!blockhash) {
            blockhash = (await SolanaManager.getRecentBlockhash()).blockhash;
        }

        if (addPriorityFee){
            const priorityFeeInstructions = await this.getPriorityFeeInstructions();
            instructions = priorityFeeInstructions.concat(instructions);
        }

        const versionedTransaction = new web3.VersionedTransaction(
            new TransactionMessage({
                payerKey: keypair.publicKey,
                recentBlockhash: blockhash,
                instructions: instructions,
            }).compileToV0Message()
        );

        versionedTransaction.sign([keypair])
        return versionedTransaction;
    }

    static async fetchTransaction(signature: string) {
        const connection = newConnection();
        const tx = connection.getTransaction(signature, {commitment: 'confirmed', maxSupportedTransactionVersion: 0});
        return tx;
    }

    static async createFreezeAccountTransaction(mint: web3.PublicKey, account: web3.PublicKey, freezeAuthority: web3.Keypair, blockhash?: string): Promise<web3.VersionedTransaction> {
        const instructions = [
            spl.createFreezeAccountInstruction(account, mint, freezeAuthority.publicKey)
        ];

        const transaction = await this.createVersionedTransaction(instructions, freezeAuthority, blockhash, false);
        return transaction;
    }

    static async createThawAccountTransaction(mint: web3.PublicKey, account: web3.PublicKey, freezeAuthority: web3.Keypair, blockhash?: string): Promise<web3.VersionedTransaction> {
        const instructions = [
            spl.createThawAccountInstruction(account, mint, freezeAuthority.publicKey)
        ];

        const transaction = await this.createVersionedTransaction(instructions, freezeAuthority, blockhash, false);
        return transaction;
    }

    static async getTokenSupply(mint: web3.PublicKey): Promise<web3.TokenAmount | undefined> {
        try {
            const connection = newConnection();
            const supply = await connection.getTokenSupply(mint);
            return supply.value;
        }
        catch (err){
            console.error('getTokenSupply', err);
        }
    }

    static async signAndSendTx(tx: web3.VersionedTransaction, keypair: Keypair, sendThrough?: SendThrough) {
        tx.sign([keypair]);

        if (sendThrough?.useJito){
            console.log(new Date(), process.env.SERVER_NAME, 'buildAndSendTx', 'sendThrough.useJito', 'sendTransaction');
            JitoManager.sendTransaction(tx, keypair, true, tx.message.recentBlockhash, sendThrough?.priority);
        }

        const rawTransaction = tx.serialize();
        const options: web3.SendOptions = {
            skipPreflight: true,
            maxRetries: 0,
        }

        if (sendThrough?.useHelius && process.env.HELIUS_RPC){
            console.log(new Date(), process.env.SERVER_NAME, 'buildAndSendTx', 'sendThrough.useHelius', 'sendTransaction');
            const connection = newConnection(process.env.HELIUS_RPC);
            connection.sendRawTransaction(rawTransaction, options);    
        }

        if (sendThrough?.useTriton && process.env.TRITON_RPC){
            console.log(new Date(), process.env.SERVER_NAME, 'buildAndSendTx', 'sendThrough.useTriton', 'sendTransaction');
            const connection = newConnection(process.env.TRITON_RPC);
            connection.sendRawTransaction(rawTransaction, options);    
        }
    }

    static isValidPublicKey(publicKey: string): boolean {
        try {
            const pk = new web3.PublicKey(publicKey);
            return web3.PublicKey.isOnCurve(pk);
        }
        catch (err){
            console.error('isValidPublicKey', err);
        }

        return false;
    }

    static async getParsedTransaction(web3Conn: web3.Connection, signature: string, tries: number = 3): Promise<web3.ParsedTransactionWithMeta | undefined>{
        const txs = await this.getParsedTransactions(web3Conn, [signature], tries);
        return txs.length > 0 ? txs[0] : undefined;
    }

    static async getParsedTransactions(web3Conn: web3.Connection, signatures: string[], tries: number = 3): Promise<web3.ParsedTransactionWithMeta[]>{
        if (signatures.length == 0) return [];

        let txs: (web3.ParsedTransactionWithMeta | null)[] = [];

        while (txs.length==0 && tries > 0){
            try {
                txs = await web3Conn.getParsedTransactions(signatures, {commitment: 'confirmed', maxSupportedTransactionVersion: 0});
            }
            catch (err){}
            tries--;

            if (!txs){
                await Helpers.sleep(1);
            }
        }

        return txs.filter(tx => tx != null) as web3.ParsedTransactionWithMeta[];
    }


    // ---------------------
    private static recentBlockhash: web3.BlockhashWithExpiryBlockHeight | undefined;
    static async getRecentBlockhash(): Promise<web3.BlockhashWithExpiryBlockHeight> {
        if (!SolanaManager.recentBlockhash){
            await this.updateBlockhash();
        }
        return SolanaManager.recentBlockhash!;
    }
    static async updateBlockhash(){
        try {
            const web3Conn = newConnection();
            SolanaManager.recentBlockhash = await web3Conn.getLatestBlockhash();    
        }
        catch (err){
            console.error('updateBlockhash', err);
        }
    }
    

}