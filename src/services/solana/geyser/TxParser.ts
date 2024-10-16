import * as grpc from "@triton-one/yellowstone-grpc/dist/grpc/solana-storage";
import base58 from "bs58";
import { newConnection } from "../lib/solana";
import * as web3 from '@solana/web3.js';
import { SolanaManager } from "../SolanaManager";
import { } from "@solana/buffer-layout";
import { decodeTransferInstruction } from "@solana/spl-token";
import { SystemInstruction } from "@solana/web3.js";
import fs from "fs";

//TODO: open-source TxParser
export class TxParser {

    static async parseGeyserTransactionWithMeta(geyserData: any, shouldFetchLookupTable = true): Promise<web3.ParsedTransactionWithMeta | undefined> {
        const confirmedTx = grpc.ConfirmedTransaction.fromJSON(geyserData.transaction.transaction);
        const geyserTxData = geyserData.transaction;
        const signature = base58.encode(geyserTxData.transaction.signature);
        const isVote: boolean = geyserTxData.transaction.isVote;
        const isVersioned = confirmedTx.transaction?.message?.versioned || false;
        const signatures = confirmedTx.transaction?.signatures.map((sig) => base58.encode(sig)) || [];
        const connection = newConnection();
        const geyserMessage: any = geyserTxData.transaction.transaction.message;

        // console.log("parseGeyserTransactionWithMeta", 'geyserTxData', signature, JSON.stringify(geyserTxData));
        // console.log("parseGeyserTransactionWithMeta", 'confirmedTx', signature, JSON.stringify(confirmedTx));

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
            for (const item of confirmedTx.transaction?.message?.addressTableLookups) {
                const address = base58.encode(item.accountKey);
                const accountKey = new web3.PublicKey(address);
                const writableIndexes = Array.from(item.writableIndexes);
                const readonlyIndexes = Array.from(item.readonlyIndexes);

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

        const heymikeAccount = accountKeys.find((account) => account.pubkey.toBase58() == '9Xt9Zj9HoAh13MpoB6hmY9UZz37L4Jabtyn8zE7AAsL');
        // console.log('!acc', 'signature:', signature, 'accountKeys:', accountKeys);

        fs.appendFile('transactions_account_keys.txt', `${new Date()} ${signature} ${JSON.stringify(accountKeys)}\n`, (err) => {
            if (err) console.error(err);
        });


        const instructions = this.parseYellowstoneGrpcCompiledInstructions(confirmedTx.transaction?.message?.instructions, accountKeys, signature);
        const innerInstructions: web3.ParsedInnerInstruction[] = [];
        if (confirmedTx.meta?.innerInstructions){
            for (const innerInstruction of confirmedTx.meta.innerInstructions){
                const parsedInnerInstructions = this.parseYellowstoneGrpcCompiledInstructions(innerInstruction.instructions, accountKeys, signature);
                innerInstructions.push({
                    index: innerInstruction.index,
                    instructions: parsedInnerInstructions,
                });
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
            err: null, //TODO: get err from confirmedTx.meta?.err
            loadedAddresses: loadedAddresses,
            computeUnitsConsumed: confirmedTx.meta.computeUnitsConsumed ? +confirmedTx.meta.computeUnitsConsumed : 0,
        };

        const message: web3.ParsedMessage = {
            accountKeys: accountKeys,
            instructions: instructions,
            recentBlockhash: confirmedTx.transaction?.message?.recentBlockhash ? base58.encode(confirmedTx.transaction.message.recentBlockhash) : '',
            addressTableLookups: addressTableLookups,
        }

        const parsedTransactionWithMeta: web3.ParsedTransactionWithMeta = {
            blockTime: Math.floor(Date.now() / 1000), // not the best way to set blockTime, but that's ok for me for now
            meta: meta,
            slot: +geyserTxData.slot, 
            transaction: {
                message: message,
                signatures: signatures,
            },
            version: isVersioned ? 0 : 'legacy',
        };

        // const realParsedTxs = await SolanaManager.getParsedTransactions(newConnection(), [signature]);

        if (heymikeAccount){ 
            fs.appendFile('mike_txs.txt', `${new Date()} ${signature} parseGeyserTransactionWithMeta parsedTx: ${JSON.stringify(parsedTransactionWithMeta)}}\n`, (err) => {
                if (err) console.error(err);
            });

            // console.log('!heymikeAccount parseGeyserTransactionWithMeta', 'signature:', signature);
            // try{
            //     console.log("parseGeyserTransactionWithMeta", 'parsedTx', signature, JSON.stringify(parsedTransactionWithMeta));
            //     // console.log("parseGeyserTransactionWithMeta", 'realParsedTx', signature, JSON.stringify(realParsedTxs));    
            // }
            // catch (e){
            //     console.error("parseGeyserTransactionWithMeta", 'error', signature, 'cannot stringify', e);
            // }
        }

        return parsedTransactionWithMeta;
    }

    static parseYellowstoneGrpcCompiledInstructions(compiledInstructions: grpc.CompiledInstruction[] | undefined, accountKeys: web3.ParsedMessageAccount[], signature?: string): (web3.ParsedInstruction | web3.PartiallyDecodedInstruction)[] {
        if (!compiledInstructions) { return []; }

        const instructions: (web3.ParsedInstruction | web3.PartiallyDecodedInstruction)[] = [];

        for (const instruction of compiledInstructions){
            const ixProgramId = (accountKeys.length > instruction.programIdIndex) ? accountKeys[instruction.programIdIndex].pubkey : undefined;
            const ixAccounts: web3.ParsedMessageAccount[] = [];
            for (const accountIndex of instruction.accounts) {
                const accountKey = (accountKeys.length > accountIndex) ? accountKeys[accountIndex] : undefined;
                if (accountKey){
                    ixAccounts.push(accountKey);
                }
                else {
                    console.error('!error pubkey', 'signature:', signature, 'accountIndex:', accountIndex, 'accountKeys:', JSON.stringify(accountKeys));
                }
            }

            const data = Buffer.from(instruction.data);

            if (ixProgramId){
                const transactionInstruction = new web3.TransactionInstruction({
                    keys: ixAccounts.map((account) => {
                        return {
                            pubkey: account.pubkey,
                            isWritable: account.writable,
                            isSigner: account.signer,
                        }
                    }),
                    programId: ixProgramId,
                    data,
                });

                let ix: web3.PartiallyDecodedInstruction | web3.ParsedInstruction | undefined = this.decodeSystemInstruction(transactionInstruction);
                
                if (!ix) {
                    ix = {
                        programId: ixProgramId,
                        accounts: ixAccounts.map((account) => account.pubkey),
                        data: base58.encode(data),
                    }
                }

                instructions.push(ix);        
            }
            else {
                console.error('!error programId', 'signature:', signature, 'programIdIndex:', instruction.programIdIndex, 'accountKeys:', JSON.stringify(accountKeys));
            }
        }

        return instructions;
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

    static decodeSystemInstruction(transactionInstruction: web3.TransactionInstruction): web3.ParsedInstruction | undefined {
        let ix: web3.ParsedInstruction | undefined = undefined;
        const ixProgramId = transactionInstruction.programId;

        if (ixProgramId.toBase58() == '11111111111111111111111111111111'){

            // System Program
            const ixProgramName = 'system';
            const ixType = SystemInstruction.decodeInstructionType(transactionInstruction);

            if (ixType === 'Transfer') {
                const data = SystemInstruction.decodeTransfer(transactionInstruction);
                ix = {
                    programId: ixProgramId,
                    program: ixProgramName,
                    parsed: {
                        type: 'transfer',
                        info: {
                            lamports: data.lamports,
                            from: data.fromPubkey.toBase58(),
                            to: data.toPubkey.toBase58(),
                        }
                    },
                }
            }
            else if (ixType === 'TransferWithSeed') {
                const data = SystemInstruction.decodeTransferWithSeed(transactionInstruction);
                ix = {
                    programId: ixProgramId,
                    program: ixProgramName,
                    parsed: {
                        type: 'transferWithSeed',
                        info: {
                            fromPubkey: data.fromPubkey.toBase58(),
                            basePubkey: data.basePubkey.toBase58(),
                            toPubkey: data.toPubkey.toBase58(),
                            lamports: data.lamports,
                            seed: data.seed,
                            programId: data.programId.toBase58(),
                        }
                    },
                }
            }
            else if (ixType === 'Create') {
                const data = SystemInstruction.decodeCreateAccount(transactionInstruction);
                ix = {
                    programId: ixProgramId,
                    program: ixProgramName,
                    parsed: {
                        type: 'create',
                        info: {
                            fromPubkey: data.fromPubkey.toBase58(),
                            newAccountPubkey: data.newAccountPubkey.toBase58(),
                            lamports: data.lamports,
                            space: data.space,
                            programId: data.programId.toBase58(),
                        }
                    },
                }
            }
            else if (ixType === 'Assign') {
                const data = SystemInstruction.decodeAssign(transactionInstruction);
                ix = {
                    programId: ixProgramId,
                    program: ixProgramName,
                    parsed: {
                        type: 'assign',
                        info: {
                            accountPubkey: data.accountPubkey.toBase58(),
                            programId: data.programId.toBase58(),
                        }
                    },
                }
            }
            else if (ixType === 'CreateWithSeed') {
                const data = SystemInstruction.decodeCreateWithSeed(transactionInstruction);
                ix = {
                    programId: ixProgramId,
                    program: ixProgramName,
                    parsed: {
                        type: 'createWithSeed',
                        info: {
                            fromPubkey: data.fromPubkey.toBase58(),
                            newAccountPubkey: data.newAccountPubkey.toBase58(),
                            basePubkey: data.basePubkey.toBase58(),
                            seed: data.seed,
                            lamports: data.lamports,
                            space: data.space,
                            programId: data.programId.toBase58(),
                        }
                    },
                }
            }
            else if (ixType === 'Allocate') {
                const data = SystemInstruction.decodeAllocate(transactionInstruction);
                ix = {
                    programId: ixProgramId,
                    program: ixProgramName,
                    parsed: {
                        type: 'allocate',
                        info: {
                            accountPubkey: data.accountPubkey.toBase58(),
                            space: data.space,
                        }
                    },
                }
            }
            else if (ixType === 'AllocateWithSeed') {
                const data = SystemInstruction.decodeAllocateWithSeed(transactionInstruction);
                ix = {
                    programId: ixProgramId,
                    program: ixProgramName,
                    parsed: {
                        type: 'allocateWithSeed',
                        info: {
                            accountPubkey: data.accountPubkey.toBase58(),
                            basePubkey: data.basePubkey.toBase58(),
                            seed: data.seed,
                            space: data.space,
                            programId: data.programId.toBase58(),
                        }
                    },
                }
            }
            else if (ixType === 'AssignWithSeed') {
                const data = SystemInstruction.decodeAssignWithSeed(transactionInstruction);
                ix = {
                    programId: ixProgramId,
                    program: ixProgramName,
                    parsed: {
                        type: 'assignWithSeed',
                        info: {
                            accountPubkey: data.accountPubkey.toBase58(),
                            basePubkey: data.basePubkey.toBase58(),
                            seed: data.seed,
                            programId: data.programId.toBase58(),
                        }
                    },
                }
            }
            else if (ixType === 'AdvanceNonceAccount') {
                const data = SystemInstruction.decodeNonceAdvance(transactionInstruction);
                ix = {
                    programId: ixProgramId,
                    program: ixProgramName,
                    parsed: {
                        type: 'advanceNonceAccount',//TODO: ???
                        info: {
                            noncePubkey: data.noncePubkey.toBase58(),
                            authorizedPubkey: data.authorizedPubkey.toBase58(),
                        }
                    },
                }
            }
            else if (ixType === 'AuthorizeNonceAccount') {
                const data = SystemInstruction.decodeNonceAuthorize(transactionInstruction);
                ix = {
                    programId: ixProgramId,
                    program: ixProgramName,
                    parsed: {
                        type: 'authorizeNonceAccount',
                        info: {
                            noncePubkey: data.noncePubkey.toBase58(),
                            authorizedPubkey: data.authorizedPubkey.toBase58(),
                            newAuthorizedPubkey: data.newAuthorizedPubkey.toBase58(),
                        }
                    },
                }
            }
            else if (ixType === 'InitializeNonceAccount') {
                const data = SystemInstruction.decodeNonceInitialize(transactionInstruction);
                ix = {
                    programId: ixProgramId,
                    program: ixProgramName,
                    parsed: {
                        type: 'initializeNonceAccount',
                        info: {
                            noncePubkey: data.noncePubkey.toBase58(),
                            authorizedPubkey: data.authorizedPubkey.toBase58(),
                        }
                    },
                }
            }
            else if (ixType === 'WithdrawNonceAccount') {
                const data = SystemInstruction.decodeNonceWithdraw(transactionInstruction);
                ix = {
                    programId: ixProgramId,
                    program: ixProgramName,
                    parsed: {
                        type: 'withdrawNonceAccount',
                        info: {
                            noncePubkey: data.noncePubkey.toBase58(),
                            authorizedPubkey: data.authorizedPubkey.toBase58(),
                            toPubkey: data.toPubkey.toBase58(),
                            lamports: data.lamports,
                        }
                    },
                }
            }
            else if (ixType === 'UpgradeNonceAccount') {
                // no parser for this ix
            }

        }


        return ix;
    }
      



}

