// import {
//     ParsedTransactionWithMeta,
//     VersionedTransaction,
//     VersionedMessage,
//     ParsedMessage,
//     ParsedInstruction,
//     PublicKey,
//     MessageAccountKeys,
// } from '@solana/web3.js';
// import { ConfirmedTransaction } from "@triton-one/yellowstone-grpc/dist/grpc/solana-storage";
// import { Buffer } from 'buffer';

// export class TxParser {
//     static convertConfirmedTransactionToParsedTransactionWithMeta(confirmedTx: ConfirmedTransaction): ParsedTransactionWithMeta {
        
//         // Deserialize the transaction
//         const transactionBuffer = Buffer.from(confirmedTx.transaction, 'base64');
//         const transaction = VersionedTransaction.deserialize(transactionBuffer);
      
//         // Parse the message
//         const message = transaction.message;
      
//         const accountKeys = message.getAccountKeys();
//         const instructions = message.compiledInstructions.map((compiledIx) => {
//           const programId = accountKeys.get(compiledIx.programIdIndex);
//           const accounts = compiledIx.accountKeyIndexes.map((idx) => accountKeys.get(idx));
//           return {
//             programId,
//             accounts,
//             data: compiledIx.data,
//           };
//         });
      
//         const parsedMessage: ParsedMessage = {
//           accountKeys: accountKeys.staticAccountKeys.map((key) => ({
//             pubkey: new PublicKey(key).toBase58(),
//             signer: accountKeys.isSigner(new PublicKey(key)),
//             writable: accountKeys.isWritable(new PublicKey(key)),
//             source: 'transaction',
//           })),
//           instructions: instructions.map((ix) => ({
//             programId: ix.programId.toBase58(),
//             parsed: ix, // Further parsing may be needed
//             program: 'spl-token', // Adjust based on your program IDs
//           })),
//           recentBlockhash: message.recentBlockhash,
//         };
      
//         // Map meta
//         const meta = confirmedTx.meta
//           ? {
//               err: confirmedTx.meta.err,
//               fee: confirmedTx.meta.fee,
//               innerInstructions: confirmedTx.meta.innerInstructions,
//               preBalances: confirmedTx.meta.preBalances,
//               postBalances: confirmedTx.meta.postBalances,
//               // Include other necessary fields
//             }
//           : null;
      
//         // Construct ParsedTransactionWithMeta
//         const parsedTransactionWithMeta: ParsedTransactionWithMeta = {
//           blockTime: confirmedTx.blockTime,
//           slot: confirmedTx.slot,
//           transaction: {
//             message: parsedMessage,
//             signatures: transaction.signatures.map((sig) => sig.toString()),
//           },
//           meta,
//         };
      
//         return parsedTransactionWithMeta;
//       }
// }

