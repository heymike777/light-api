import { ConfirmedTransaction } from "@triton-one/yellowstone-grpc/dist/grpc/solana-storage";
import base58 from "bs58";
import { newConnection } from "../lib/solana";
import * as web3 from '@solana/web3.js';
import { SolanaManager } from "../SolanaManager";
import { } from "@solana/buffer-layout";
import { decodeTransferInstruction } from "@solana/spl-token";
import { SystemInstruction } from "@solana/web3.js";

export class TxParser {

    static async parseGeyserTransactionWithMeta(geyserData: any, shouldFetchLookupTable = true): Promise<web3.ParsedTransactionWithMeta | undefined> {
        const confirmedTx = ConfirmedTransaction.fromJSON(geyserData.transaction.transaction);
        const geyserTxData = geyserData.transaction;
        const signature = base58.encode(geyserTxData.transaction.signature);
        const isVote: boolean = geyserTxData.transaction.isVote;
        const isVersioned = confirmedTx.transaction?.message?.versioned || false;
        const signatures = confirmedTx.transaction?.signatures.map((sig) => base58.encode(sig)) || [];
        const connection = newConnection();
        const geyserMessage: any = geyserTxData.transaction.transaction.message;

        console.log("parseGeyserTransactionWithMeta", 'geyserTxData', signature, JSON.stringify(geyserTxData));
        console.log("parseGeyserTransactionWithMeta", 'confirmedTx', signature, JSON.stringify(confirmedTx));

        const postTokenBalances: web3.TokenBalance[] = [];
        const preTokenBalances: web3.TokenBalance[] = [];
        if (confirmedTx.meta?.preTokenBalances){
            for (const balance of confirmedTx.meta?.preTokenBalances) {
                if (balance.uiTokenAmount){
                    preTokenBalances.push({
                        accountIndex: balance.accountIndex,
                        mint: balance.mint,
                        owner: balance.owner,
                        uiTokenAmount: {
                            amount: balance.uiTokenAmount.amount,
                            decimals: balance.uiTokenAmount.decimals,
                            uiAmount: balance.uiTokenAmount.uiAmount,
                            uiAmountString: balance.uiTokenAmount.uiAmountString
                        },
                    });   
                }             
            }
        }
        if (confirmedTx.meta?.postTokenBalances){
            for (const balance of confirmedTx.meta?.postTokenBalances) {
                if (balance.uiTokenAmount){
                    postTokenBalances.push({
                        accountIndex: balance.accountIndex,
                        mint: balance.mint,
                        owner: balance.owner,
                        uiTokenAmount: {
                            amount: balance.uiTokenAmount.amount,
                            decimals: balance.uiTokenAmount.decimals,
                            uiAmount: balance.uiTokenAmount.uiAmount,
                            uiAmountString: balance.uiTokenAmount.uiAmountString
                        },
                    });   
                }             
            }
        }

        const accountKeys: web3.ParsedMessageAccount[] = []; 
        if (confirmedTx.transaction?.message?.accountKeys){
            let accountIndex = 0;
            for (const key of confirmedTx.transaction?.message?.accountKeys){
                accountKeys.push({
                    pubkey: new web3.PublicKey(base58.encode(key)),
                    signer: this.isAccountSigner(geyserMessage, accountIndex),
                    writable: this.isAccountWritable(geyserMessage, accountIndex),
                    source: 'transaction'
                });
                accountIndex++;
            }
        }
        const lookupTableAccounts: web3.AddressLookupTableAccount[] = [];
        const addressTableLookups: web3.ParsedAddressTableLookup[] = [];
        const loadedAddresses: web3.LoadedAddresses = {
            writable: [],
            readonly: [],
        };
        if (confirmedTx.transaction?.message?.addressTableLookups){
            // console.log((confirmedTx.transaction?.message?.addressTableLookups.length>1 ? 'yes' : 'no'), 'confirmedTx.transaction?.message?.addressTableLookups.length', confirmedTx.transaction?.message?.addressTableLookups.length)

            // for (const item of confirmedTx.transaction?.message?.addressTableLookups) {
            //     const address = base58.encode(item.accountKey);
            //     const accountKey = new web3.PublicKey(address);
            //     const writableIndexes = Array.from(item.writableIndexes);
            //     const readonlyIndexes = Array.from(item.readonlyIndexes);

            //     console.log('addressTableLookups', 'signature:', signature, 'address:', address, 'writableIndexes:', writableIndexes, 'readonlyIndexes:', readonlyIndexes);
            // }

            for (const item of confirmedTx.transaction?.message?.addressTableLookups) {
                const address = base58.encode(item.accountKey);
                const accountKey = new web3.PublicKey(address);
                const writableIndexes = Array.from(item.writableIndexes);
                const readonlyIndexes = Array.from(item.readonlyIndexes);

                // console.log("parseGeyserTransactionWithMeta", 'addressTableLookups', 'signature:', signature, 'address:', address, 'writableIndexes:', writableIndexes, 'readonlyIndexes:', readonlyIndexes);

                addressTableLookups.push({
                    accountKey: accountKey,
                    writableIndexes: writableIndexes,
                    readonlyIndexes: readonlyIndexes,
                });

                if (shouldFetchLookupTable){
                    //TODO: should I cache this?... So that I don't fetch it every time if lookupTable is the same
                    const lookupTableAccount = (
                        await connection.getAddressLookupTable(accountKey)
                    ).value;

                    if (lookupTableAccount){
                        lookupTableAccounts.push(lookupTableAccount);

                        for (const index of readonlyIndexes) {
                            if (lookupTableAccount.state.addresses.length >= index){
                                const key = lookupTableAccount.state.addresses[index];
                                loadedAddresses.readonly.push(key);
                            }
                        }
                        for (const index of writableIndexes) {
                            if (lookupTableAccount.state.addresses.length >= index){
                                const key = lookupTableAccount.state.addresses[index];
                                loadedAddresses.writable.push(key);
                            }
                        }
                    }

                }
            }

            if (loadedAddresses.writable.length > 0){
                for (const pubkey of loadedAddresses.writable) {
                    accountKeys.push({
                        pubkey: pubkey,
                        signer: false,
                        writable: true,
                        source: 'lookupTable'
                    });
                }
            }
            if (loadedAddresses.readonly.length > 0){
                for (const pubkey of loadedAddresses.readonly) {
                    accountKeys.push({
                        pubkey: pubkey,
                        signer: false,
                        writable: false,
                        source: 'lookupTable'
                    });
                }
            }
        }
        console.log('!acc', 'signature:', signature, 'accountKeys:', accountKeys);

        const innerInstructions: web3.ParsedInnerInstruction[] = [];
        const instructions: (web3.ParsedInstruction | web3.PartiallyDecodedInstruction)[] = [];

        if (confirmedTx.transaction?.message?.instructions){
            for (const instruction of confirmedTx.transaction?.message?.instructions){
                const ixProgramId = (accountKeys.length > instruction.programIdIndex) ? accountKeys[instruction.programIdIndex].pubkey : undefined;
                const ixAccounts: web3.PublicKey[] = [];
                for (const accountIndex of instruction.accounts) {
                    const pubkey = (accountKeys.length > accountIndex) ? accountKeys[accountIndex].pubkey : undefined;
                    if (pubkey){
                        ixAccounts.push(pubkey);
                    }
                    else {
                        console.error('!error pubkey', 'signature:', signature, 'accountIndex:', accountIndex, 'accountKeys:', JSON.stringify(accountKeys));
                    }
                }

                // export interface CompiledInstruction {
                //     programIdIndex: number;
                //     accounts: Uint8Array;
                //     data: Uint8Array;
                // }

                const data = Buffer.from(instruction.data);

                // if (SystemInstruction.decodeInstructionType(instruction) === 'Transfer') {
                //     const transferData = SystemInstruction.decodeTransfer(instruction);
                //     console.log('Transfer Amount:', transferData.lamports);
                //     console.log('From:', transferData.fromPubkey.toBase58());
                //     console.log('To:', transferData.toPubkey.toBase58());
                //   }

                if (ixProgramId){

                    const transactionInstruction = new web3.TransactionInstruction({
                        keys: ixAccounts,
                        programId: ixProgramId,
                        data,
                    });

                    // const ix: web3.PartiallyDecodedInstruction = {
                    //     programId: ixProgramId,
                    //     accounts: ixAccounts,
                    //     data: data.toString(),
                    // }
                    // instructions.push(ix);    
                }
                else {
                    console.error('!error programId', 'signature:', signature, 'programIdIndex:', instruction.programIdIndex, 'accountKeys:', JSON.stringify(accountKeys));
                }
            }
        }

        const meta: web3.ParsedTransactionMeta | null = !confirmedTx.meta ? null : {
            fee: confirmedTx.meta?.fee ? +confirmedTx.meta.fee : 0,
            innerInstructions: innerInstructions,
            preBalances: confirmedTx.meta.preBalances.map((balance) => +balance),
            postBalances: confirmedTx.meta.postBalances.map((balance) => +balance),
            logMessages: confirmedTx.meta.logMessages,
            preTokenBalances: preTokenBalances,
            postTokenBalances:postTokenBalances,
            err: null, // since I subscribe to successful transactions only
            loadedAddresses: loadedAddresses,
            computeUnitsConsumed: confirmedTx.meta.computeUnitsConsumed ? +confirmedTx.meta.computeUnitsConsumed : 0,
        }

        const message: web3.ParsedMessage = {
            accountKeys: accountKeys,
            instructions: instructions,
            recentBlockhash: confirmedTx.transaction?.message?.recentBlockhash ? base58.encode(confirmedTx.transaction.message.recentBlockhash) : '',
            addressTableLookups: addressTableLookups,
        }

        const parsedTransactionWithMeta: web3.ParsedTransactionWithMeta = {
            blockTime: Math.floor(Date.now() / 1000), // not the best way to set blockTime, but that's ok for me for now
            slot: +geyserTxData.slot, 
            version: isVersioned ? 0 : 'legacy',
            transaction: {
                signatures: signatures,
                message: message
            },
            meta: meta,
        };

        const realParsedTxs = await SolanaManager.getParsedTransactions(newConnection(), [signature]);

        console.log("parseGeyserTransactionWithMeta", 'parsedTx', signature, JSON.stringify(parsedTransactionWithMeta));
        console.log("parseGeyserTransactionWithMeta", 'realParsedTx', signature, JSON.stringify(realParsedTxs));

        return parsedTransactionWithMeta;
    }

    static isAccountSigner(geyserMessage: any, accountIndex: number) {
        return accountIndex < geyserMessage.header.numRequiredSignatures;
    }

    static isAccountWritable(geyserMessage: any, accountIndex: number) {
        const numSignedAccounts = geyserMessage.header.numRequiredSignatures;
        const numWritableSignedAccounts = geyserMessage.header.numRequiredSignatures - geyserMessage.header.numReadonlySignedAccounts;
        const numWritableUnsignedAccounts = geyserMessage.accountKeys.length - numSignedAccounts - geyserMessage.header.numReadonlyUnsignedAccounts;
      
        if (accountIndex < numWritableSignedAccounts) {
            return true; // Writable signed accounts
        } 
        else if (accountIndex >= numSignedAccounts && accountIndex < numSignedAccounts + numWritableUnsignedAccounts) {
            return true; // Writable unsigned accounts
        } 
        else {
            return false; // Read-only accounts
        }
    }
      



}

