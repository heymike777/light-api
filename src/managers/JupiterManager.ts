import axios from "axios";
import { Instruction, QuoteGetSwapModeEnum, QuoteResponse, ResponseError, createJupiterApiClient } from '@jup-ag/api';
import * as web3 from '@solana/web3.js';
import { LogManager } from "./LogManager";

export interface JupQuotes {
    inAmount: string,
    outAmount: string, 
    quoteResponse: QuoteResponse,
}

export interface JupSwapInstructionsInclude {
    includeTokenLedgerInstruction?: boolean,
    includeComputeBudgetInstructions?: boolean,
    includeSetupInstructions?: boolean,
    includeSwapInstruction?: boolean,
    includeCleanupInstruction?: boolean,
}

export class JupiterManager {

    static config = {
        basePath: process.env.JUPITER_URL!,
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

    static async getQuote(inputMint: string, outputMint: string, amount: number, slippage: number, swapMode: QuoteGetSwapModeEnum = QuoteGetSwapModeEnum.ExactIn): Promise<JupQuotes | undefined> {
        try {
            const maxAutoSlippageBps = Math.round(slippage * 100);
            LogManager.forceLog('maxAutoSlippageBps:', maxAutoSlippageBps);
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
                
                // maxAccounts: 30,
                // restrictIntermediateTokens: false,
            });

            // console.log('quotes:', JSON.stringify(quotes, null, 2));

            return {
                inAmount: quotes.inAmount,
                outAmount: quotes.outAmount,
                quoteResponse: quotes
            };
        }
        catch (e: any) {
        }

        return undefined;
    }

    static async swapInstructions(quoteResponse: QuoteResponse, walletAddress: string, slippage: number, prioritizationFeeLamports: 'auto' | number = 'auto', include?: JupSwapInstructionsInclude): Promise<{instructions: web3.TransactionInstruction[], addressLookupTableAddresses: string[]}> {
        const response = await this.quoteApi.swapInstructionsPost({
            swapRequest: {
                userPublicKey: walletAddress,
                quoteResponse: quoteResponse,    
                useSharedAccounts: false,    
                dynamicComputeUnitLimit: true,
                prioritizationFeeLamports: prioritizationFeeLamports,
                wrapAndUnwrapSol: true,
                dynamicSlippage: {
                    maxBps: Math.round(slippage * 100),
                },                
            }
        });

        const instructions: Instruction[] = [];
        if (response.tokenLedgerInstruction && (!include || include.includeTokenLedgerInstruction)) { instructions.push(response.tokenLedgerInstruction); }
        if (response.computeBudgetInstructions && (!include || include.includeComputeBudgetInstructions)) { instructions.push(...response.computeBudgetInstructions); }
        if (response.setupInstructions && (!include || include.includeSetupInstructions)) { instructions.push(...response.setupInstructions); }
        if (response.swapInstruction && (!include || include.includeSwapInstruction)) { instructions.push(response.swapInstruction); }
        if (response.cleanupInstruction && (!include || include.includeCleanupInstruction)) { instructions.push(response.cleanupInstruction); }

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