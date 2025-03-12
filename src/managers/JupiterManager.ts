import axios from "axios";
import { ConfigurationParameters, Instruction, QuoteResponse, ResponseError, SwapMode, createJupiterApiClient } from '@jup-ag/api';
import * as web3 from '@solana/web3.js';
import { LogManager } from "./LogManager";
import { Priority } from "../services/solana/types";

export interface JupQuotes {
    inAmount: string,
    outAmount: string, 
    quoteResponse: QuoteResponse,
}

export interface JupSwapInstructionsInclude {
    includeOtherInstruction?: boolean,
    includeComputeBudgetInstructions?: boolean,
    includeSetupInstructions?: boolean,
    includeSwapInstruction?: boolean,
    includeCleanupInstruction?: boolean,
}

export class JupiterManager {

    static config: ConfigurationParameters = {
        apiKey: process.env.JUPITER_API_KEY || undefined,
    };
    static quoteApi = createJupiterApiClient(this.config);

    static async getPrices(mints: string[]): Promise<{address: string, price: number}[]> {        
        if (mints.length === 0) {
            return [];
        }

        try {
            const url = `https://api.jup.ag/price/v2?ids=${mints.join(',')}`;
            const response = await axios.get(url);
            if (response.status === 200) {
                const data = response.data?.data;
                if (data) {
                    return Object.keys(data).map(key => {
                        return {
                            address: key,
                            price: +data[key].price,
                        };
                    });
                }
            }
        }
        catch (error) {
            // LogManager.error('JupiterManager', 'getPrices', error);
        }

        return [];
    }

    static async getQuote(inputMint: string, outputMint: string, amount: number, slippage: number, swapMode: SwapMode = SwapMode.ExactIn): Promise<JupQuotes | undefined> {
        try {
            const maxAutoSlippageBps = Math.round(slippage * 100);
            LogManager.forceLog('maxAutoSlippageBps:', maxAutoSlippageBps);
            
            console.log('get quotes for', {
                inputMint,
                outputMint,
                amount,
                swapMode: swapMode,
                slippageBps: maxAutoSlippageBps,     
            });

            const quotes = await this.quoteApi.quoteGet({
                inputMint,
                outputMint,
                amount,
                swapMode: swapMode,
                // autoSlippage: true,
                // dynamicSlippage: true,
                // minimizeSlippage: true,
                // maxAutoSlippageBps: maxAutoSlippageBps,
                slippageBps: maxAutoSlippageBps,     
                // platformFeeBps: 100, // 1% fee

                // maxAccounts: 30,
                // restrictIntermediateTokens: false,
            });

            console.log('quotes:', JSON.stringify(quotes, null, 2));

            return {
                inAmount: quotes.inAmount,
                outAmount: quotes.outAmount,
                quoteResponse: quotes
            };
        }
        catch (e: any) {
            console.error('getQuote error:', e);
        }

        return undefined;
    }

    static async swapInstructions(quoteResponse: QuoteResponse, walletAddress: string, priorityFee: Priority, include?: JupSwapInstructionsInclude): Promise<{instructions: web3.TransactionInstruction[], addressLookupTableAddresses: string[]}> {
        let priorityLevel: 'medium' | 'high' | 'veryHigh' | undefined = undefined;
        let prioritizationFeeMaxLamports = 10000000; // 0.01 SOL
        if (priorityFee == Priority.MEDIUM) { priorityLevel = 'medium'; }
        else if (priorityFee == Priority.HIGH) { priorityLevel = 'high'; }
        else if (priorityFee == Priority.ULTRA) { priorityLevel = 'veryHigh'; }

        console.log('swapInstructions', 'priorityFee:', priorityFee, 'priorityLevel:', priorityLevel, 'prioritizationFeeMaxLamports:', prioritizationFeeMaxLamports);

        const response = await this.quoteApi.swapInstructionsPost({
            swapRequest: {
                userPublicKey: walletAddress,
                quoteResponse: quoteResponse,    
                useSharedAccounts: false,   
                dynamicComputeUnitLimit: true,
                wrapAndUnwrapSol: true,
                prioritizationFeeLamports: {
                    priorityLevelWithMaxLamports: {
                        priorityLevel: priorityFee,
                        maxLamports: prioritizationFeeMaxLamports
                    }
                }
            }
        });

        const instructions: Instruction[] = [];
        if (response.computeBudgetInstructions && (!include || include.includeComputeBudgetInstructions)) { instructions.push(...response.computeBudgetInstructions); }
        if (response.setupInstructions && (!include || include.includeSetupInstructions)) { instructions.push(...response.setupInstructions); }
        if (response.swapInstruction && (!include || include.includeSwapInstruction)) { instructions.push(response.swapInstruction); }
        if (response.cleanupInstruction && (!include || include.includeCleanupInstruction)) { instructions.push(response.cleanupInstruction); }
        if (response.otherInstructions && (!include || include.includeOtherInstruction)) { instructions.push(response.otherInstructions); }

        return {instructions: this.instructionsToTransactionInstructions(instructions), addressLookupTableAddresses: response.addressLookupTableAddresses};
    }

    static instructionsToTransactionInstructions(instructions: Instruction[]): web3.TransactionInstruction[] {
        const txInstructions: web3.TransactionInstruction[] = [];
        for (const instruction of instructions) {
            txInstructions.push(this.instructionToTransactionInstruction(instruction));
        }
        return txInstructions;
    }

    static instructionToTransactionInstruction(instruction: Instruction): web3.TransactionInstruction {
        return new web3.TransactionInstruction({
           programId: new web3.PublicKey(instruction.programId),
           keys: instruction.accounts.map(k => {
                return {
                     pubkey: new web3.PublicKey(k.pubkey),
                     isSigner: k.isSigner,
                     isWritable: k.isWritable,
                };
            }),
            data: Buffer.from(instruction.data, 'base64'), 
        });
    }

}