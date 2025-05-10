import axios from "axios";
import { ConfigurationParameters, Instruction, QuoteResponse, ResponseError, SwapMode, createJupiterApiClient } from '@jup-ag/api';
import * as web3 from '@solana/web3.js';
import { LogManager } from "./LogManager";
import { Priority } from "../services/solana/types";
import { EnvManager } from "./EnvManager";
import { SystemNotificationsManager } from "./SytemNotificationsManager";

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
        if (!EnvManager.isPricesProcess){
            return [];
        }
        
        if (mints.length === 0) {
            return [];
        }

        // console.log('JupiterManager', 'getPrices', mints.join(','));

        try {
            const url = `https://api.jup.ag/price/v2?ids=${mints.join(',')}`;
            const response = await axios.get(url);
            if (response.status === 200) {
                const data = response.data?.data;
                if (data) {
                    // console.log('JupiterManager', 'getPrices', 'data:', data, 'keys:', Object.keys(data));

                    const prices: {address: string, price: number}[] = [];
                    for (const key in data) {
                        if (data[key] && data[key].price){
                            const price = +data[key].price;
                            if (price > 0){
                                prices.push({
                                    address: key,
                                    price: price,
                                });
                            }
                        }
                    }
                    return prices;

                    // return Object.keys(data).map(key => {
                    //     return {
                    //         address: key,
                    //         price: +data[key].price,
                    //     };
                    // });
                }
            }
        }
        catch (error: any) {
            LogManager.error('JupiterManager', 'getPrices', error);
            SystemNotificationsManager.sendSystemMessage('JupiterManager getPrices error:' + error.message);
        }

        return [];
    }

    static async getQuote(inputMint: string, outputMint: string, amount: number, slippage: number, swapMode: SwapMode = SwapMode.ExactIn): Promise<JupQuotes | undefined> {
        try {
            // console.log('JupiterManager', 'getQuote', inputMint, '->', outputMint);
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
                // platformFeeBps: 100, // 1% fee

                // maxAccounts: 30,
                // restrictIntermediateTokens: false,
            });

            return {
                inAmount: quotes.inAmount,
                outAmount: quotes.outAmount,
                quoteResponse: quotes
            };
        }
        catch (error: any) {
            LogManager.error('getQuote error:', error);
            SystemNotificationsManager.sendSystemMessage('JupiterManager getQuote error:' + error.message);
        }

        return undefined;
    }

    static async swapInstructions(quoteResponse: QuoteResponse, walletAddress: string, priorityFee: Priority, include?: JupSwapInstructionsInclude): Promise<{instructions: web3.TransactionInstruction[], addressLookupTableAddresses: string[]}> {
        // console.log('JupiterManager', 'swapInstructions');
        let priorityLevel: 'medium' | 'high' | 'veryHigh' | undefined = undefined;
        let prioritizationFeeMaxLamports = 10000000; // 0.01 SOL
        if (priorityFee == Priority.MEDIUM) { priorityLevel = 'medium'; }
        else if (priorityFee == Priority.HIGH) { priorityLevel = 'high'; }
        else if (priorityFee == Priority.ULTRA) { priorityLevel = 'veryHigh'; }

        const response = await this.quoteApi.swapInstructionsPost({
            swapRequest: {
                userPublicKey: walletAddress,
                quoteResponse: quoteResponse,    
                useSharedAccounts: false,   
                dynamicComputeUnitLimit: true,
                wrapAndUnwrapSol: true,
                prioritizationFeeLamports: {
                    priorityLevelWithMaxLamports: {
                        priorityLevel: priorityLevel,
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
        if (response.otherInstructions && (!include || include.includeOtherInstruction)) { instructions.push(...response.otherInstructions); }

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