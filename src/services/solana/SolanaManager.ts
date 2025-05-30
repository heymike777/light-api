import nacl from "tweetnacl";
import * as web3 from '@solana/web3.js';
import * as spl from '@solana/spl-token';
import { getRpc, newConnection, newConnectionByChain } from "./lib/solana";
import axios from "axios";
import { Chain, Priority, WalletModel } from "./types";
import base58 from "bs58";
import { HeliusManager } from "./HeliusManager";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { TransactionMessage } from "@solana/web3.js";
// import { JitoManager } from "./JitoManager";
import { Keypair } from "@solana/web3.js";
import { base64ToUint8Array, Helpers } from "../helpers/Helpers";
import { LogManager } from "../../managers/LogManager";
import { Interface } from "helius-sdk";
import { getNativeToken, kRaydiumAuthority, kSolAddress } from "./Constants";
import BN from "bn.js";
import { MetaplexManager } from "../../managers/MetaplexManager";
import { TransactionInstruction } from "@solana/web3.js";
import { AddressLookupTableAccount } from "@solana/web3.js";
import { Connection } from "@solana/web3.js";
import { VersionedTransaction } from "@solana/web3.js";

export interface CreateTransactionResponse {
    tx: web3.Transaction,
    blockhash: web3.BlockhashWithExpiryBlockHeight,
}

export interface TokenBalance {
    amount: BN;
    uiAmount: number;
    decimals?: number;
    ataPubKey?: web3.PublicKey;
}

export type SendThrough = {
    priority?: Priority,
    useJito?: boolean,
    useHelius?: boolean,
    useTriton?: boolean,
}

export interface LPToken {
    lpMint: string,
    amount: BN,
    decimals: number,
    supply: BN,
}

export interface Asset {
    address: string;
    amount: number;
    uiAmount: number;
    decimals: number;

    symbol: string;
    name?: string;
    description?: string;
    logo?: string;
    supply?: number;

    priceInfo?: {
        pricePerToken: number;
        totalPrice: number;
    };

    // mintAuthority?: string;
    // freezeAuthority?: string;
    
    // tokenPrice: number;
    // tokenPriceChange: number;
    // tokenMarketCap: number;
    // tokenVolume: number;
    // tokenLiquidity: number;
    // tokenNft: string;
}

export class SolanaManager {

    static verify(message: string, walletId: string, signature: string): boolean {
        try {
            return this.verifyMessage(message, walletId, signature);
        }
        catch (error){
            LogManager.error(error);
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
            LogManager.error(error);
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
                LogManager.log(process.env.SERVER_NAME, signature.publicKey.toBase58(), 'have not signed!!!');
            }
        }

        LogManager.log(process.env.SERVER_NAME, 'isVerifiedSignatures', isVerifiedSignatures);

        if (isVerifiedSignatures){
            // LogManager.log(process.env.SERVER_NAME, '!transaction', transaction);
            const wireTransaction = transaction.serialize();
            const signature = await web3Conn.sendRawTransaction(wireTransaction, {skipPreflight: false});    
            LogManager.log(process.env.SERVER_NAME, 'signature', signature);
            return signature;    
        }
    
        return undefined;
    }

    static async isBlockhashValid(blockhash: string, chain?: Chain) : Promise<boolean | undefined> {
        const { data } = await axios.post(getRpc(chain).http, {
            "id": 45,
            "jsonrpc": "2.0",
            "method": "isBlockhashValid",
            "params": [
                blockhash,
                {
                    "commitment": "confirmed"
                }
            ]
        });

        const value = data?.result?.value;

        return (value==true || value==false) ? value : undefined;
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

    static async getAtaAddress(walletAddress: web3.PublicKey, mint: web3.PublicKey): Promise<web3.PublicKey> {
        const publicKey = await spl.getAssociatedTokenAddress(mint, walletAddress);
        return publicKey;
    }

    static async createSplAccountInstruction(mint: web3.PublicKey, walletPublicKey: web3.PublicKey, feePayerPublicKey: web3.PublicKey, tokenAddress?: web3.PublicKey): Promise<web3.TransactionInstruction>{
        if (!tokenAddress){
            tokenAddress = await spl.getAssociatedTokenAddress(mint, walletPublicKey);
        }

        LogManager.log(process.env.SERVER_NAME, 'createSplAccountInstruction', 'tokenAddress', tokenAddress.toBase58());
        return spl.createAssociatedTokenAccountInstruction(
            feePayerPublicKey,
            tokenAddress,
            walletPublicKey,
            mint,
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
            console.log('MIKE BONK ACCOUNT EXISTS', account);
        } catch (error: unknown) {
            console.log('MIKE BONK ACCOUNT NOT EXISTS');

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
            LogManager.log(process.env.SERVER_NAME, 'filteredAccounts.length:', filteredAccounts.length);

            const transactions: web3.Transaction[] = [];
            
            const recentBlockhash = (await web3Conn.getLatestBlockhash('confirmed')).blockhash;
            
            const chunksArr = chunks(filteredAccounts);

            const mainWallet = web3.Keypair.fromSecretKey(bs58.decode(process.env.ROOT_PRIVATE_KEY!));

            for (const chunk of chunksArr) {
                const txn = new web3.Transaction();
                txn.feePayer = mainWallet.publicKey;
                txn.recentBlockhash = recentBlockhash;
                for (const account of chunk) {
                    // Add a `closeAccount` instruction for every token account in the chunk
                    if (account.account.data.parsed.info.tokenAmount.uiAmount > 0) {
                        // LogManager.log('account.account.data.parsed', account.account.data.parsed);
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


            LogManager.log(process.env.SERVER_NAME, 'transactions.length:', transactions.length);
            if (transactions.length > 1) {
                LogManager.log(process.env.SERVER_NAME, 'TOO MANY TRANSACTIONS');
                return;
            }

            // Sign and send all transactions
            for (const tx of transactions) {
                try{
                    tx.partialSign(keypair);
                    tx.partialSign(mainWallet)
                    const signedTransaction = await SolanaManager.partialSignAndSend(web3Conn, tx);
                    LogManager.log(process.env.SERVER_NAME, 'signedTransaction', signedTransaction);        
                }
                catch (err){
                    LogManager.error('closeEmptyTokenAccounts', err);
                }
                
                //sleep 100 ms
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        return ataAmount;
    }

    static async getWalletSolBalance(chain: Chain, walletAddress?: string): Promise<TokenBalance | undefined>{
        if (!walletAddress) return undefined;

        const connection = newConnectionByChain(chain);
        const kSOL = getNativeToken(chain);

        try {
            const mainWalletPublicKey = new web3.PublicKey(walletAddress);
            const balance = await connection.getBalance(mainWalletPublicKey);
            return {amount: new BN(balance), uiAmount: Math.round(1000 * balance / kSOL.lamportsPerSol) / 1000, decimals: kSOL.decimals};
        }
        catch (err){
            LogManager.error('getWalletSolBalance', err);
        }

        return undefined;
    }

    static async getWalletsSolBalances(chain: Chain, walletAddresses: string[]): Promise<(TokenBalance & {publicKey: string})[]>{
        const connection = newConnectionByChain(chain);

        const publicKeys = walletAddresses.map(address => new web3.PublicKey(address));
        const accounts = await connection.getMultipleAccountsInfo(publicKeys);
        const kSOL = getNativeToken(chain);

        const balances: (TokenBalance & {publicKey: string})[] = [];
        let index = 0;
        for (const account of accounts) {
            const publicKey = walletAddresses[index];

            if (account) {
                balances.push({amount: new BN(account.lamports), uiAmount: account.lamports / kSOL.lamportsPerSol, decimals: kSOL.decimals, publicKey});
            }
            else {
                balances.push({amount: new BN(0), uiAmount: 0, decimals: kSOL.decimals, publicKey});
            }

            index++;
        }

        return balances;
    }

    static async getWalletTokenBalance(chain: Chain, walletAddress: string, tokenAddress: string): Promise<TokenBalance>{
        try {
            const connection = newConnectionByChain(chain);
            
            // LogManager.log(process.env.SERVER_NAME, 'getWalletTokenBalance', 'walletAddress', walletAddress, 'tokenAddress', tokenAddress);
            const mainWalletPublicKey = new web3.PublicKey(walletAddress);
            const tokenPublicKey = new web3.PublicKey(tokenAddress);
            const tmp = await connection.getParsedTokenAccountsByOwner(mainWalletPublicKey, {mint: tokenPublicKey});
            // LogManager.log(process.env.SERVER_NAME, 'getWalletTokenBalance', 'tmp', JSON.stringify(tmp));

            return {
                amount: new BN(tmp.value[0].account.data.parsed.info.tokenAmount.amount), 
                uiAmount: +(tmp.value[0].account.data.parsed.info.tokenAmount.uiAmount),
                decimals: tmp.value[0].account.data.parsed.info.tokenAmount.decimals,
                ataPubKey: tmp.value[0].pubkey
            }
        }
        catch (err){
            // LogManager.error('getWalletTokenBalance', err);
        }

        return {amount: new BN(0), uiAmount: 0};
    }

    static async addPriorityFeeToTransaction(transaction: web3.Transaction): Promise<web3.Transaction>{
        const instructions = await this.getPriorityFeeInstructions();
        transaction.add(...instructions);
        return transaction;
    }

    static async getPriorityFeeInstructions(priority?: Priority): Promise<web3.TransactionInstruction[]> {
        let feeEstimate = 0;
        if (priority == Priority.LOW) {
            feeEstimate = 10000;
        }
        else{
            feeEstimate = 1000000;// await HeliusManager.getRecentPrioritizationFees();
        }
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

    static async createVersionedTransaction(chain: Chain, instructions: web3.TransactionInstruction[], keypair: web3.Keypair, addressLookupTableAccounts?: web3.AddressLookupTableAccount[], blockhash?: string, addPriorityFee: boolean = false): Promise<web3.VersionedTransaction> {
        if (!blockhash) {
            blockhash = (await SolanaManager.getRecentBlockhash(chain)).blockhash;
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
            }).compileToV0Message(addressLookupTableAccounts)
        );

        versionedTransaction.sign([keypair])
        return versionedTransaction;
    }

    static async createFreezeAccountTransaction(mint: web3.PublicKey, account: web3.PublicKey, freezeAuthority: web3.Keypair, blockhash?: string): Promise<web3.VersionedTransaction> {
        const instructions = [
            spl.createFreezeAccountInstruction(account, mint, freezeAuthority.publicKey)
        ];

        const transaction = await this.createVersionedTransaction(Chain.SOLANA, instructions, freezeAuthority, undefined, blockhash, false);
        return transaction;
    }

    static async createThawAccountTransaction(mint: web3.PublicKey, account: web3.PublicKey, freezeAuthority: web3.Keypair, blockhash?: string): Promise<web3.VersionedTransaction> {
        const instructions = [
            spl.createThawAccountInstruction(account, mint, freezeAuthority.publicKey)
        ];

        const transaction = await this.createVersionedTransaction(Chain.SOLANA, instructions, freezeAuthority, undefined, blockhash, false);
        return transaction;
    }

    static isValidPublicKey(publicKey: string): boolean {
        LogManager.log(`isValidPublicKey: "${publicKey}"`);
        try {
            const pk = new web3.PublicKey(publicKey);
            return true; // web3.PublicKey.isOnCurve(pk);
        }
        catch (err){
            // LogManager.error('isValidPublicKey', err);
        }

        return false;
    }

    static async getParsedTransaction(chain: Chain, signature: string, tries: number = 3): Promise<web3.ParsedTransactionWithMeta | undefined>{
        const txs = await this.getParsedTransactions(chain, [signature], tries);
        return txs.length > 0 ? txs[0] : undefined;
    }

    static async getParsedTransactions(chain: Chain, signatures: string[], tries: number = 3): Promise<web3.ParsedTransactionWithMeta[]>{
        const connection = newConnectionByChain(chain);
        if (signatures.length == 0) return [];

        let txs: (web3.ParsedTransactionWithMeta | null)[] = [];

        while (txs.length==0 && tries > 0){
            try {
                txs = await connection.getParsedTransactions(signatures, {commitment: 'confirmed', maxSupportedTransactionVersion: 0});
            }
            catch (err){}
            tries--;

            if (!txs){
                await Helpers.sleep(1);
            }
        }

        return txs.filter(tx => tx != null && !tx.meta?.err) as web3.ParsedTransactionWithMeta[];
    }    

    static async getTokenAccountBalance(web3Conn: web3.Connection, tokenAccount: web3.PublicKey): Promise<web3.TokenAmount | undefined>{
        try {
            const balance = await web3Conn.getTokenAccountBalance(tokenAccount, 'confirmed');
            return balance.value;
        }
        catch (err){
            LogManager.error('getTokenAccountBalance', err);
        }

        return undefined;
    }

    static async getAddressLookupTableAccounts(connection: web3.Connection, keys: string[]) {
        const addressLookupTableAccountInfos = await connection.getMultipleAccountsInfo(
            keys.map((key) => new web3.PublicKey(key))
        );
      
        const results = addressLookupTableAccountInfos.reduce((acc: web3.AddressLookupTableAccount[], accountInfo, index) => {
            const addressLookupTableAddress = keys[index];
            if (accountInfo) {
                const addressLookupTableAccount = new web3.AddressLookupTableAccount({
                    key: new web3.PublicKey(addressLookupTableAddress),
                    state: web3.AddressLookupTableAccount.deserialize(accountInfo.data),
                });
                acc.push(addressLookupTableAccount);
            }
            return acc;
        }, []);

        return results;
    };

    static async getAssetsByOwner(chain: Chain, walletAddress: string): Promise<{ assets: Asset[], lpTokens: LPToken[] }> {
        const heliusData = await HeliusManager.getAssetsByOwner(walletAddress, {
            showNativeBalance: true,
            showFungible: true,
            showSystemMetadata: true,
            showGrandTotal: false,
            showClosedAccounts: false,
            showZeroBalance: false,
            showCollectionMetadata: false,
            showUnverifiedCollections: false,
            showRawData: false,
        });
        const heliusAssets = heliusData.items;
        const nativeBalance = heliusData.nativeBalance;

        console.log('heliusData:', JSON.stringify(heliusData));

        const assets: Asset[] = [];
        
        const kSOL = getNativeToken(chain);

        if (nativeBalance){
            const asset: Asset = {
                address: kSolAddress,
                amount: nativeBalance.lamports,
                uiAmount: nativeBalance.lamports / kSOL.lamportsPerSol,
                decimals: kSOL.decimals,
                symbol: kSOL.symbol,
                name: kSOL.name,
                logo: kSOL.logo,
                priceInfo: { 
                    pricePerToken: nativeBalance.price_per_sol, 
                    totalPrice: nativeBalance.total_price,
                },
            };
            assets.push(asset);
        }

        const lpTokens: LPToken[] = [];
        for (const heliusAsset of heliusAssets) {
            if (heliusAsset.token_info?.mint_authority == kRaydiumAuthority && heliusAsset.token_info.balance && heliusAsset.token_info.balance > 0){
                lpTokens.push({
                    lpMint: heliusAsset.id,
                    amount: new BN(heliusAsset.token_info.balance),
                    decimals: heliusAsset.token_info.decimals || 0,
                    supply: new BN(heliusAsset.token_info.supply || 0),
                });
            }

            if (heliusAsset.interface != Interface.FUNGIBLE_TOKEN && heliusAsset.interface != Interface.FUNGIBLE_ASSET) { continue; }
            if (!heliusAsset.token_info || !heliusAsset.token_info?.symbol) { continue; }
            if (heliusAsset.compression?.compressed) { continue; }

            const decimals = heliusAsset.token_info?.decimals || 0;
            const amount = heliusAsset.token_info?.balance || 0;
            const uiAmount = amount / 10**decimals;
            const logo = heliusAsset.content?.files?.find(file => file.mime == 'image/png' || file.mime == 'image/jpg' || file.mime == 'image/jpeg')?.uri;
            const symbol = heliusAsset.token_info.symbol.trim();
            const name = heliusAsset.content?.metadata?.name ? heliusAsset.content?.metadata?.name.trim() : symbol;

            const pricePerToken = heliusAsset.token_info?.price_info?.price_per_token || 0;
            const totalPrice = heliusAsset.token_info?.price_info?.total_price || 0;

            const asset: Asset = {
                address: heliusAsset.id,
                amount: amount,
                uiAmount: uiAmount,
                decimals: decimals,
                symbol: symbol,
                name: name,
                description: heliusAsset.content?.metadata?.description,
                logo: logo,
                supply: (heliusAsset.token_info?.supply || 0) / 10**decimals,
                priceInfo: heliusAsset.token_info?.price_info ? { pricePerToken, totalPrice } : undefined,
                // mintAuthority: heliusAsset.token_info?.mint_authority,
                // freezeAuthority: heliusAsset.freezeAuthority,
            };

            LogManager.log('getAssetsByOwner', 'heliusAsset:', JSON.stringify(heliusAsset));

            assets.push(asset);
        }

        for (const asset of assets) {
            if (asset.priceInfo){
                asset.priceInfo.totalPrice = Math.round(100 * asset.priceInfo.totalPrice) / 100;
            }
        }

        // sort by priceInfo.totalPrice
        assets.sort((a, b) => (b.priceInfo?.totalPrice || 0) - (a.priceInfo?.totalPrice || 0));

        return { assets, lpTokens };
    }

    static createBurnSplAccountInstruction(tokenAta: web3.PublicKey, destination: web3.PublicKey, authority: web3.PublicKey): web3.TransactionInstruction {
        return spl.createCloseAccountInstruction(
            tokenAta,
            destination,
            authority,
        );    
    }  

    static async getTokenSupply(connection: web3.Connection, mint: string): Promise<web3.TokenAmount | undefined> {
        try {
            const mintPublicKey = new web3.PublicKey(mint);
            const supplyInfo = await connection.getTokenSupply(mintPublicKey);
            console.log('supplyInfo:', supplyInfo);
            return supplyInfo?.value;
        }
        catch (err){
            LogManager.error('getTokenSupply', err);
        }

        return undefined;
    }

    static async getTokenMint(chain: Chain, mint: string): Promise<spl.Mint | undefined> {
        try {
            const connection = newConnectionByChain(chain);
            const mintPublicKey = new web3.PublicKey(mint);
            const mintInfo = await spl.getMint(connection, mintPublicKey);
            return mintInfo;    
        }
        catch (err){
            LogManager.error('getTokenMint', 'chain:', chain, 'err:', err);
        }
        return undefined;
    }

    static async getFreezeAuthorityRevoked(chain: Chain, mint: string): Promise<boolean> {
        const mintInfo = await this.getTokenMint(chain, mint);
        if (mintInfo && mintInfo.freezeAuthority == null) {
            return true;
        }
        return false;
    }

    
    static async getWalletTokensBalances(chain: Chain, walletAddress: string): Promise<{mint: string, symbol?: string, name?: string, balance: TokenBalance}[]>{
        const res = await Promise.all([
            this.getWalletTokensBalancesForProgram(chain, walletAddress, spl.TOKEN_PROGRAM_ID),
            this.getWalletTokensBalancesForProgram(chain, walletAddress, spl.TOKEN_2022_PROGRAM_ID)
        ]);

        return [
            ...res[0],
            ...res[1],
        ];        
    }

    static async getWalletTokensBalancesForProgram(chain: Chain, walletAddress: string, programId: web3.PublicKey): Promise<{mint: string, symbol?: string, name?: string, balance: TokenBalance}[]>{
        try {
            // console.log('getWalletTokensBalancesForProgram', 'chain:', chain, 'walletAddress:', walletAddress, 'programId:', programId.toBase58());

            const web3Conn = newConnectionByChain(chain);

            // console.log(new Date(), process.env.SERVER_NAME, 'getWalletTokenBalance', 'walletAddress', walletAddress, 'tokenAddress', tokenAddress);
            const mainWalletPublicKey = new web3.PublicKey(walletAddress);
            const accounts = await web3Conn.getParsedTokenAccountsByOwner(mainWalletPublicKey, { programId });

            const mints = accounts.value.map((element) => element.account.data.parsed.info.mint);
            const assets = await MetaplexManager.fetchAllDigitalAssets(chain, mints);

            const balances: {mint: string, symbol?: string, name?: string, balance: TokenBalance}[] = [];
            for (const element of accounts.value) {
                if (
                    element.account.data.parsed.info.mint && 
                    element.account.data.parsed.info.tokenAmount.amount && 
                    element.account.data.parsed.info.tokenAmount.uiAmount &&
                    element.account.data.parsed.info.tokenAmount.decimals &&
                    element.pubkey
                ){
                    const mint = element.account.data.parsed.info.mint;
                    const asset = assets.find((asset) => asset.mint.publicKey == mint);
                    const symbol = asset ? asset.metadata.symbol : undefined;
                    const name = asset ? asset.metadata.name : undefined;

                    console.log('!mike', 'mint:', mint, 'symbol:', symbol, 'asset:', asset);

                    balances.push({
                        mint: mint,
                        symbol: symbol,
                        name: name,
                        balance: {
                            amount: new BN(element.account.data.parsed.info.tokenAmount.amount), 
                            uiAmount: +(element.account.data.parsed.info.tokenAmount.uiAmount),
                            decimals: element.account.data.parsed.info.tokenAmount.decimals,
                            ataPubKey: element.pubkey    
                        },
                    });
                }
            }

            // console.log('getWalletTokensBalancesForProgram', 'balances:', balances);

            return balances;
        }
        catch (err){
            // LogManager.error('getWalletTokenBalance', err);
        }

        return [];
    }

    static async extractTransactionComponents(connection: Connection, transactionData: string): Promise<{ instructions: TransactionInstruction[]; lookups: AddressLookupTableAccount[], blockhash: string }>  {
        const txBuf = base58.decode(transactionData);
        const existingTransaction = new VersionedTransaction(web3.VersionedMessage.deserialize(Uint8Array.from(txBuf)))

        const addressLookupTableAccounts: AddressLookupTableAccount[] = await this.resolveAddressLookupTables(
            existingTransaction,
            connection,
        );

        const decompiledMessage = TransactionMessage.decompile(existingTransaction.message, {
            addressLookupTableAccounts,
        });

        return {
            instructions: decompiledMessage.instructions,
            lookups: addressLookupTableAccounts,
            blockhash: decompiledMessage.recentBlockhash,
        };
    };

    static async resolveAddressLookupTables(transaction: VersionedTransaction, connection: Connection): Promise<AddressLookupTableAccount[]> {
        const addressLookupTableAccounts: AddressLookupTableAccount[] = [];

        if (transaction.message.addressTableLookups.length > 0) {
            const lookupTablePromises = transaction.message.addressTableLookups.map(async (lookup) => {
                const account = await connection.getAddressLookupTable(lookup.accountKey);
                if (account.value) {
                    return account.value;
                }
                throw new Error(`Failed to fetch lookup table: ${lookup.accountKey.toBase58()}`);
            });

            const lookupTables = await Promise.all(lookupTablePromises);
            addressLookupTableAccounts.push(...lookupTables);
        }

        return addressLookupTableAccounts;
    };

    // ---------------------
    private static recentBlockhash: web3.BlockhashWithExpiryBlockHeight | undefined;
    private static recentBlockhashUpdatedAt: Date | undefined;
    static async getRecentBlockhash(chain: Chain): Promise<web3.BlockhashWithExpiryBlockHeight> {
        if (chain == Chain.SOLANA){
            await this.updateBlockhash();
            return SolanaManager.recentBlockhash!;    
        }
        else {
            const connection = newConnectionByChain(chain);
            const blockhash = await connection.getLatestBlockhash('confirmed');
            return blockhash;
        }
    }
    static async updateBlockhash(){
        // if now is less than 15 seconds from last update, then skip
        const now = new Date();
        if (SolanaManager.recentBlockhashUpdatedAt && now.getTime() - SolanaManager.recentBlockhashUpdatedAt.getTime() < 15000){
            return;
        }

        try {
            const web3Conn = newConnection(undefined);
            SolanaManager.recentBlockhash = await web3Conn.getLatestBlockhash('confirmed');    
            SolanaManager.recentBlockhashUpdatedAt = now;
        }
        catch (err){
            LogManager.error('updateBlockhash', err);
        }
    }
    

}