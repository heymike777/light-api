import base58 from "bs58";
import * as web3 from '@solana/web3.js';
import { SolanaManager } from "../SolanaManager";
import { } from "@solana/buffer-layout";
import { SystemInstruction } from "@solana/web3.js";
import * as spl from "@solana/spl-token";
import { Ix } from "../../../managers/ProgramManager";
import { LogManager } from "../../../managers/LogManager";

export interface JsonParsedInstruction {
    program?: string;
    programId: string;
    accounts?: string[];
    data?: string;
    parsed?: any;
    stackHeight?: any;
}

export interface JsonParsed {
    transaction: {
        signatures: string[];
        message: {
            accountKeys: {
                pubkey: string;
                writable: boolean;
                signer: boolean;
                source?: 'transaction' | 'lookupTable';
            }[];
            recentBlockhash: string;
            instructions: JsonParsedInstruction[];
            addressTableLookups: {
                accountKey: string;
                writableIndexes: number[];
                readonlyIndexes: number[];
            }[];
        };
    };
    meta: {
        err: any;
        status: {
            Ok: any;
        };
        fee: number;
        preBalances: number[];
        postBalances: number[];
        innerInstructions: {
            index: number;
            instructions: JsonParsedInstruction[];
        }[];
        logMessages: string[];
        preTokenBalances: {
            accountIndex: number;
            mint: string;
            uiTokenAmount: {
                uiAmount: number;
                decimals: number;
                amount: string;
                uiAmountString: string;
            };
            owner: string;
            programId: string;
        }[];
        postTokenBalances: {
            accountIndex: number;
            mint: string;
            uiTokenAmount: {
                uiAmount: number;
                decimals: number;
                amount: string;
                uiAmountString: string;
            };
            owner: string;
            programId: string;
        }[];
        computeUnitsConsumed: number;
    };
    version?: 'legacy' | 0;
    slot: number;
    blockTime: number;
}

export class TxParser {

    static async parseGeyserTransactionWithMeta(jsonParsed: JsonParsed): Promise<web3.ParsedTransactionWithMeta | undefined> {
        // const isVote: boolean = geyserTxData.transaction.isVote;
        // const slot = +geyserTxData.slot;

        const meta: web3.ParsedTransactionMeta | null = !jsonParsed.meta ? null : {
            fee: jsonParsed.meta?.fee ? +jsonParsed.meta.fee : 0,
            innerInstructions: jsonParsed.meta.innerInstructions.map((ii) => {
                return {
                    index: ii.index,
                    instructions: ii.instructions.map((ix) => {
                        return this.jsonParsedInstructionToParsedInstruction(ix);
                    })
                }
            }),
            preBalances: jsonParsed.meta.preBalances,
            postBalances: jsonParsed.meta.postBalances,
            logMessages: jsonParsed.meta.logMessages,
            preTokenBalances: jsonParsed.meta.preTokenBalances,
            postTokenBalances: jsonParsed.meta.postTokenBalances,
            err: jsonParsed.meta.err,
            loadedAddresses: {
                writable: jsonParsed.transaction.message.accountKeys.filter((ak) => ak.source === 'lookupTable' && ak.writable).map((ak) => new web3.PublicKey(ak.pubkey)),
                readonly: jsonParsed.transaction.message.accountKeys.filter((ak) => ak.source === 'lookupTable' && !ak.writable).map((ak) => new web3.PublicKey(ak.pubkey)),
            },
            computeUnitsConsumed: jsonParsed.meta.computeUnitsConsumed || 0,
        };

        const message: web3.ParsedMessage = {
            accountKeys: jsonParsed.transaction.message.accountKeys.map((ak) => {
                return {
                    pubkey: new web3.PublicKey(ak.pubkey),
                    signer: ak.signer,
                    writable: ak.writable,
                    source: ak.source,
                }
            }),
            instructions: jsonParsed.transaction.message.instructions.map((ix) => {
                return this.jsonParsedInstructionToParsedInstruction(ix);      
            }),
            recentBlockhash: jsonParsed.transaction.message.recentBlockhash,
            addressTableLookups: jsonParsed.transaction.message.addressTableLookups.map((lookup) => {
                return {
                    accountKey: new web3.PublicKey(lookup.accountKey),
                    writableIndexes: lookup.writableIndexes,
                    readonlyIndexes: lookup.readonlyIndexes,
                }
            }),
        }

        const parsedTransactionWithMeta: web3.ParsedTransactionWithMeta = {
            blockTime: jsonParsed.blockTime ||  Math.floor(Date.now() / 1000), // not the best way to set blockTime, but that's ok for me for now
            meta: meta,
            slot: jsonParsed.slot || 0,
            transaction: {
                message: message,
                signatures: jsonParsed.transaction.signatures,
            },
            version: jsonParsed.version,
        };

        return parsedTransactionWithMeta;
    }

    static jsonParsedInstructionToParsedInstruction(ix: JsonParsedInstruction): web3.ParsedInstruction | web3.PartiallyDecodedInstruction {
        const programId = new web3.PublicKey(ix.programId);
        const accounts = ix.accounts?.map((account) => new web3.PublicKey(account)) || [];
        // const stackHeight = ix.stackHeight || undefined;

        if (ix.parsed) {
            const parsedInstruction:  web3.ParsedInstruction = {
                program: ix.program || '',
                programId: programId,
                parsed: ix.parsed,
            };
            return parsedInstruction;
        }
        else {
            const parsedInstruction:  web3.PartiallyDecodedInstruction = {
                programId: programId,
                accounts: accounts,
                data: ix.data || '',
            }
            return parsedInstruction;
        }
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

