import * as grpc from "@triton-one/yellowstone-grpc/dist/types/grpc/solana-storage";
import base58 from "bs58";
import * as web3 from '@solana/web3.js';
import { SolanaManager } from "../SolanaManager";
import { } from "@solana/buffer-layout";
import { SystemInstruction } from "@solana/web3.js";
import * as spl from "@solana/spl-token";
import { Ix } from "../../../managers/ProgramManager";
import { LogManager } from "../../../managers/LogManager";

//TODO: open-source TxParser
export class TxParser {

    static async parseGeyserTransactionWithMeta(geyserData: any, shouldFetchLookupTable = true): Promise<web3.ParsedTransactionWithMeta | undefined> {
        const confirmedTx = grpc.ConfirmedTransaction.fromJSON(geyserData.transaction.transaction);
        LogManager.log('confirmedTx', confirmedTx);
        const geyserTxData = geyserData.transaction;
        const signature = base58.encode(geyserTxData.transaction.signature);
        const isVote: boolean = geyserTxData.transaction.isVote;
        const isVersioned = confirmedTx.transaction?.message?.versioned || false;
        const signatures = confirmedTx.transaction?.signatures.map((sig) => base58.encode(sig)) || [];
        const geyserMessage: any = geyserTxData.transaction.transaction.message;
        const slot = +geyserTxData.slot;

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
                    const lookupTableAccount = await SolanaManager.fetchLookupTableAccount(accountKey.toBase58());

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
            slot: slot, 
            transaction: {
                message: message,
                signatures: signatures,
            },
            version: isVersioned ? 0 : 'legacy',
        };

        return parsedTransactionWithMeta;
    }

    static parseYellowstoneGrpcCompiledInstructions(compiledInstructions: grpc.CompiledInstruction[] | undefined, accountKeys: web3.ParsedMessageAccount[], signature?: string): Ix[] {
        if (!compiledInstructions) { return []; }

        const instructions: Ix[] = [];

        for (const instruction of compiledInstructions){
            const ixProgramId = (accountKeys.length > instruction.programIdIndex) ? accountKeys[instruction.programIdIndex].pubkey : undefined;
            const ixAccounts: web3.ParsedMessageAccount[] = [];
            for (const accountIndex of instruction.accounts) {
                const accountKey = (accountKeys.length > accountIndex) ? accountKeys[accountIndex] : undefined;
                if (accountKey){
                    ixAccounts.push(accountKey);
                }
                else {
                    LogManager.error('!error pubkey', 'signature:', signature, 'accountIndex:', accountIndex, 'accountKeys:', JSON.stringify(accountKeys));
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

                let ix: web3.PartiallyDecodedInstruction | web3.ParsedInstruction | undefined = this.decodeSystemInstruction(transactionInstruction, signature);
                
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
                LogManager.error('!error programId', 'signature:', signature, 'programIdIndex:', instruction.programIdIndex, 'accountKeys:', JSON.stringify(accountKeys));
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

    // https://docs.solanalabs.com/runtime/programs
    static decodeSystemInstruction(transactionInstruction: web3.TransactionInstruction, signature?: string): web3.ParsedInstruction | undefined {
        try {
            let ix: web3.ParsedInstruction | undefined = undefined;
            const ixProgramId = transactionInstruction.programId;

            if (ixProgramId.toBase58() == web3.SystemProgram.programId.toBase58()){
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
                                lamports: +data.lamports.toString(),
                                source: data.fromPubkey.toBase58(),
                                destination: data.toPubkey.toBase58(),
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
                                source: data.fromPubkey.toBase58(),
                                sourceBase: data.basePubkey.toBase58(),
                                destination: data.toPubkey.toBase58(),
                                lamports: +data.lamports.toString(),
                                sourceSeed: data.seed,
                                sourceOwner: data.programId.toBase58(),
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
                            type: 'createAccount',
                            info: {
                                source: data.fromPubkey.toBase58(),
                                newAccount: data.newAccountPubkey.toBase58(),
                                lamports: +data.lamports.toString(),
                                space: data.space,
                                owner: data.programId.toBase58(),
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
                            type: 'createAccountWithSeed',
                            info: {
                                source: data.fromPubkey.toBase58(),
                                newAccount: data.newAccountPubkey.toBase58(),
                                base: data.basePubkey.toBase58(),
                                seed: data.seed,
                                lamports: +data.lamports.toString(),
                                space: data.space,
                                owner: data.programId.toBase58(),
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
                                account: data.accountPubkey.toBase58(),
                                owner: data.programId.toBase58(),
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
                                account: data.accountPubkey.toBase58(),
                                base: data.basePubkey.toBase58(),
                                seed: data.seed,
                                owner: data.programId.toBase58(),
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
                                account: data.accountPubkey.toBase58(),
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
                                account: data.accountPubkey.toBase58(),
                                base: data.basePubkey.toBase58(),
                                seed: data.seed,
                                space: data.space,
                                owner: data.programId.toBase58(),
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
                            type: 'advanceNonce',
                            info: {
                                nonceAccount: data.noncePubkey.toBase58(),
                                nonceAuthority: data.authorizedPubkey.toBase58(),
                                // recentBlockhashesSysvar: data.recentBlockhashesSysvarPubkey.toBase58(), // I can't find this in the decoded data
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
                            type: 'authorizeNonce',
                            info: {
                                nonceAccount: data.noncePubkey.toBase58(),
                                nonceAuthority: data.authorizedPubkey.toBase58(),
                                newAuthorized: data.newAuthorizedPubkey.toBase58(),
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
                            type: 'initializeNonce',
                            info: {
                                nonceAccount: data.noncePubkey.toBase58(),
                                nonceAuthority: data.authorizedPubkey.toBase58(),
                                // recentBlockhashesSysvar: data.recentBlockhashesSysvarPubkey.toBase58(), // I can't find this in the decoded data
                                // rentSysvar: data.rentSysvarPubkey.toBase58(), // I can't find this in the decoded data
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
                            type: 'withdrawFromNonce',
                            info: {
                                nonceAccount: data.noncePubkey.toBase58(),
                                nonceAuthority: data.authorizedPubkey.toBase58(),
                                destination: data.toPubkey.toBase58(),
                                lamports: +data.lamports.toString(),
                                // recentBlockhashesSysvar: data.recentBlockhashesSysvarPubkey.toBase58(), // I can't find this in the decoded data
                                // rentSysvar: data.rentSysvarPubkey.toBase58(), // I can't find this in the decoded data
                            }
                        },
                    }
                }
                // else if (ixType === 'UpgradeNonceAccount') {
                //     // no parser for this ix
                // }

            }
            else if (ixProgramId.toBase58() == web3.StakeProgram.programId.toBase58()){
                // Stake Program
                // LogManager.log('!stake', 'ixProgramId:', ixProgramId.toBase58());

                const ixProgramName = 'Stake Program';
                const ixType = web3.StakeInstruction.decodeInstructionType(transactionInstruction);

                if (ixType === 'Authorize') {
                    const data = web3.StakeInstruction.decodeAuthorize(transactionInstruction);
                    ix = {
                        programId: ixProgramId,
                        program: ixProgramName,
                        parsed: {
                            type: 'authorize',
                            info: {
                                stakeAccount: data.stakePubkey.toBase58(),
                                authority: data.authorizedPubkey.toBase58(),
                                newAuthority: data.newAuthorizedPubkey.toBase58(),
                                authorityType: data.stakeAuthorizationType,
                                custodian: data.custodianPubkey?.toBase58(),
                                // clockSysvar // I can't find this in the decoded data
                            }
                        },
                    }
                }
                else if (ixType === 'AuthorizeWithSeed') {
                    const data = web3.StakeInstruction.decodeAuthorizeWithSeed(transactionInstruction);
                    ix = {
                        programId: ixProgramId,
                        program: ixProgramName,
                        parsed: {
                            type: 'authorizeWithSeed',
                            info: {
                                stakeAccount: data.stakePubkey.toBase58(),
                                authorityOwner: data.authorityOwner.toBase58(),
                                newAuthorized: data.newAuthorizedPubkey.toBase58(),
                                authorityType: data.stakeAuthorizationType,
                                authorityBase: data.authorityBase.toBase58(),
                                authoritySeed: data.authoritySeed,
                                custodian: data.custodianPubkey?.toBase58(),
                            }
                        },
                    }
                }
                else if (ixType === 'Deactivate') {
                    const data = web3.StakeInstruction.decodeDeactivate(transactionInstruction);
                    ix = {
                        programId: ixProgramId,
                        program: ixProgramName,
                        parsed: {
                            type: 'deactivate',
                            info: {
                                stakeAccount: data.stakePubkey.toBase58(),
                                stakeAuthority: data.authorizedPubkey.toBase58(),
                                // clockSysvar // I can't find this in the decoded data
                            }
                        },
                    }
                }
                else if (ixType === 'Delegate') {
                    const data = web3.StakeInstruction.decodeDelegate(transactionInstruction);
                    ix = {
                        programId: ixProgramId,
                        program: ixProgramName,
                        parsed: {
                            type: 'delegate',
                            info: {
                                stakeAccount: data.stakePubkey.toBase58(),
                                stakeAuthority: data.authorizedPubkey.toBase58(),
                                voteAccount: data.votePubkey.toBase58(),
                                // stakeHistorySysvar: data.stakeHistorySysvarPubkey.toBase58(), // I can't find this in the decoded data
                                // stakeConfigAccount: data.stakeConfigPubkey.toBase58(), // I can't find this in the decoded data
                                // clockSysvar // I can't find this in the decoded data
                            }
                        },
                    }
                }
                else if (ixType === 'Initialize') {
                    const data = web3.StakeInstruction.decodeInitialize(transactionInstruction);
                    ix = {
                        programId: ixProgramId,
                        program: ixProgramName,
                        parsed: {
                            type: 'initialize',
                            info: {
                                stakeAccount: data.stakePubkey.toBase58(),
                                authorized: {
                                    staker: data.authorized.staker.toBase58(),
                                    withdrawer: data.authorized.withdrawer.toBase58(),
                                },
                                lockup: data.lockup ? {
                                    unixTimestamp: data.lockup.unixTimestamp,
                                    epoch: data.lockup.epoch,
                                    custodian: data.lockup.custodian?.toBase58(),
                                } : undefined, // or Lockup.default ??
                                // rentSysvar // I can't find this in the decoded data
                            }
                        },
                    }
                }
                else if (ixType === 'Merge') {
                    const data = web3.StakeInstruction.decodeMerge(transactionInstruction);
                    ix = {
                        programId: ixProgramId,
                        program: ixProgramName,
                        parsed: {
                            type: 'merge',
                            info: {
                                source: data.sourceStakePubKey.toBase58(),
                                destination: data.stakePubkey.toBase58(),
                                stakeAuthority: data.authorizedPubkey.toBase58(),
                                // stakeHistorySysvar: data.stakeHistorySysvarPubkey.toBase58(), // I can't find this in the decoded data
                                // clockSysvar // I can't find this in the decoded data
                            }
                        },
                    }
                }
                else if (ixType === 'Split') {
                    const data = web3.StakeInstruction.decodeSplit(transactionInstruction);
                    ix = {
                        programId: ixProgramId,
                        program: ixProgramName,
                        parsed: {
                            type: 'split',
                            info: {
                                stakeAccount: data.stakePubkey.toBase58(),
                                newSplitAccount: data.splitStakePubkey.toBase58(),
                                stakeAuthority: data.authorizedPubkey.toBase58(),
                                lamports: +data.lamports.toString(),
                            }
                        },
                    }
                }
                else if (ixType === 'Withdraw') {
                    const data = web3.StakeInstruction.decodeWithdraw(transactionInstruction);
                    ix = {
                        programId: ixProgramId,
                        program: ixProgramName,
                        parsed: {
                            type: 'withdraw',
                            info: {
                                stakeAccount: data.stakePubkey.toBase58(),
                                destination: data.toPubkey.toBase58(),
                                withdrawAuthority: data.authorizedPubkey.toBase58(),
                                lamports: +data.lamports.toString(),
                                // clockSysvar // I can't find this in the decoded data
                                // stakeHistorySysvar: data.stakeHistorySysvarPubkey.toBase58(), // I can't find this in the decoded data
                            }
                        },
                    }
                }

                // LogManager.log('!stake', 'ixType:', ixType, 'ix:', ix);

            }
            else if (ixProgramId.toBase58() == web3.VoteProgram.programId.toBase58()){
                // Vote Program

                const ixProgramName = 'Vote Program';
                const ixType = web3.VoteInstruction.decodeInstructionType(transactionInstruction);
                // 'Authorize' | 'AuthorizeWithSeed' | 'InitializeAccount' | 'Withdraw' | 'UpdateValidatorIdentity';

                if (ixType === 'Authorize') {
                    const data = web3.VoteInstruction.decodeAuthorize(transactionInstruction);
                    ix = {
                        programId: ixProgramId,
                        program: ixProgramName,
                        parsed: {
                            type: 'authorize',
                            info: {
                                voteAccount: data.votePubkey.toBase58(),
                                /** Current vote or withdraw authority, depending on `voteAuthorizationType` */
                                authority: data.authorizedPubkey.toBase58(),
                                newAuthority: data.newAuthorizedPubkey.toBase58(),
                                authorityType: data.voteAuthorizationType, // is this correct?
                                // clockSysvar // I can't find this in the decoded data
                            }
                        },
                    }
                }
                else if (ixType === 'AuthorizeWithSeed'){
                    const data = web3.VoteInstruction.decodeAuthorizeWithSeed(transactionInstruction);
                    ix = {
                        programId: ixProgramId,
                        program: ixProgramName,
                        parsed: {
                            type: 'authorizeWithSeed',
                            info: {
                                voteAccount: data.votePubkey.toBase58(),
                                authorityBase: data.currentAuthorityDerivedKeyBasePubkey.toBase58(),
                                authorityOwner: data.currentAuthorityDerivedKeyOwnerPubkey.toBase58(),
                                authoritySeed: data.currentAuthorityDerivedKeySeed,
                                newAuthorized: data.newAuthorizedPubkey.toBase58(),
                                authorityType: data.voteAuthorizationType,
                                // clockSysvar // I can't find this in the decoded data
                            }
                        },
                    }
                }
                else if (ixType === 'InitializeAccount'){
                    const data = web3.VoteInstruction.decodeInitializeAccount(transactionInstruction);
                    ix = {
                        programId: ixProgramId,
                        program: ixProgramName,
                        parsed: {
                            type: 'initialize',
                            info: {
                                voteAccount: data.votePubkey.toBase58(),
                                node: data.nodePubkey.toBase58(),
                                authorizedVoter: data.voteInit.authorizedVoter.toBase58(),
                                authorizedWithdrawer: data.voteInit.authorizedWithdrawer.toBase58(),
                                commission: data.voteInit.commission,
                                // clockSysvar // I can't find this in the decoded data
                                // rentSysvar // I can't find this in the decoded data
                            }
                        },
                    }
                }
                else if (ixType === 'Withdraw'){
                    const data = web3.VoteInstruction.decodeWithdraw(transactionInstruction);
                    ix = {
                        programId: ixProgramId,
                        program: ixProgramName,
                        parsed: {
                            type: 'withdraw',
                            info: {
                                voteAccount: data.votePubkey.toBase58(),
                                destination: data.toPubkey.toBase58(),
                                withdrawAuthority: data.authorizedWithdrawerPubkey.toBase58(),
                                lamports: +data.lamports.toString(),
                            }
                        },
                    }
                }
                else if (ixType === 'UpdateValidatorIdentity'){
                    // no parser for this ix
                }
            }
            else if (ixProgramId.toBase58() == spl.TOKEN_PROGRAM_ID.toBase58()){
                // Token Program
                // console.log('why no parser for this TOKEN_PROGRAM_ID?');
                //TODO: why no parser for this TOKEN_PROGRAM_ID?

                // const ixProgramName = 'Token Program';
                // const decodedIx = spl.decodeInstruction(transactionInstruction);   
            
                // let ixType: string | undefined = undefined;
                // if (decodedIx.data.instruction == spl.TokenInstruction.InitializeMint){ ixType = 'initializeMint'; }
                // else if (decodedIx.data.instruction == spl.TokenInstruction.InitializeAccount){ ixType = 'initializeAccount'; }
                // else if (decodedIx.data.instruction == spl.TokenInstruction.InitializeMultisig){ ixType = 'initializeMultisig'; }
                // else if (decodedIx.data.instruction == spl.TokenInstruction.Transfer){ ixType = 'transfer'; }
                // else if (decodedIx.data.instruction == spl.TokenInstruction.Approve){ ixType = 'approve'; }
                // else if (decodedIx.data.instruction == spl.TokenInstruction.Revoke){ ixType = 'revoke'; }
                // else if (decodedIx.data.instruction == spl.TokenInstruction.SetAuthority){ ixType = 'setAuthority'; }
                // else if (decodedIx.data.instruction == spl.TokenInstruction.MintTo){ ixType = 'mintTo'; }
                // else if (decodedIx.data.instruction == spl.TokenInstruction.Burn){ ixType = 'burn'; }
                // else if (decodedIx.data.instruction == spl.TokenInstruction.CloseAccount){ ixType = 'closeAccount'; }
                // else if (decodedIx.data.instruction == spl.TokenInstruction.FreezeAccount){ ixType = 'freezeAccount'; }
                // else if (decodedIx.data.instruction == spl.TokenInstruction.ThawAccount){ ixType = 'thawAccount'; }
                // else if (decodedIx.data.instruction == spl.TokenInstruction.TransferChecked){ ixType = 'transferChecked'; }
                // else if (decodedIx.data.instruction == spl.TokenInstruction.ApproveChecked){ ixType = 'approveChecked'; }
                // else if (decodedIx.data.instruction == spl.TokenInstruction.MintToChecked){ ixType = 'mintToChecked'; }
                // else if (decodedIx.data.instruction == spl.TokenInstruction.BurnChecked){ ixType = 'burnChecked'; }
                // else if (decodedIx.data.instruction == spl.TokenInstruction.InitializeAccount2){ ixType = 'initializeAccount2'; }
                // else if (decodedIx.data.instruction == spl.TokenInstruction.SyncNative){ ixType = 'syncNative'; }
                // else if (decodedIx.data.instruction == spl.TokenInstruction.InitializeAccount3){ ixType = 'initializeAccount3'; }
                // else if (decodedIx.data.instruction == spl.TokenInstruction.InitializeMint2){ ixType = 'initializeMint2'; }
                // else if (decodedIx.data.instruction == spl.TokenInstruction.AmountToUiAmount){ ixType = 'amountToUiAmount'; }
                // else if (decodedIx.data.instruction == spl.TokenInstruction.UiAmountToAmount){ ixType = 'uiAmountToAmount'; }
                // else { ixType = 'unknown'; }

                // console.log('!ixType:', ixType, 'decodedIx:', JSON.stringify(decodedIx));

                // ix = {
                //     programId: ixProgramId,
                //     program: ixProgramName,
                //     parsed: {
                //         type: ixType,
                //         info: {
                            
                //         }
                //     },
                // }
            }

            return ix;
        }
        catch (err){            
            // LogManager.error('!error(catched)', 'signature:', signature, 'decodeSystemInstruction', err);
            // LogManager.log('!error(catched)', 'decodeSystemInstruction', 'transactionInstruction:', transactionInstruction);
            return undefined;
        }
    }
      



}

