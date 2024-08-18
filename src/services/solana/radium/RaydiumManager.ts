import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import * as web3 from "@solana/web3.js";
import { LIQUIDITY_STATE_LAYOUT_V4, MARKET_STATE_LAYOUT_V3, Market, MAINNET_PROGRAM_ID, TxVersion, DEVNET_PROGRAM_ID, buildSimpleTransaction, Liquidity, InnerSimpleV0Transaction, LiquidityPoolKeys, jsonInfo2PoolKeys, ApiPoolInfoV4, SPL_MINT_LAYOUT, TokenAmount, TOKEN_PROGRAM_ID, LOOKUP_TABLE_CACHE, Percent, TokenAccount, Token, CurrencyAmount, BigNumberish, InstructionType } from "@raydium-io/raydium-sdk";
import { JitoManager } from "../JitoManager";
import { SolanaManager } from "../SolanaManager";
import Decimal from "decimal.js";
import BN from 'bn.js';
import { OpenOrders } from "@project-serum/serum";
import { HeliusManager } from "../HeliusManager";
import { newConnection } from "../lib/solana";
import { Priority } from "../types";

export interface RaydiumSwapInstructionData {
    instructionType: number;

    amountIn?: bigint;
    minAmountOut?: bigint;

    maxAmountIn?: bigint; 
    amountOut?: bigint;
}

export type SwapInputInfo = {
    type: 'buy' | 'sell',
    outputToken: Token,
    targetPool: string,
    inputTokenAmount: TokenAmount,
    walletTokenAccounts: TokenAccount[],
    wallet: Keypair,
    lpDecimals?: number,
    fixedSide: 'in' | 'out',
    tokenAta: string,
    tokenMint: string,

    sendThrough?: SendThrough,

    amountIn?: BN,
    maxAmountIn?: number,
}

export type SendThrough = {
    priority?: Priority;
    useJito?: boolean,
    useHelius?: boolean,
    useTriton?: boolean,
}

export type AddAmmLiquidityInputInfo = {
    quoteToken: Token,
    targetPool: string,
    inputTokenAmount: TokenAmount,    
    walletTokenAccounts: TokenAccount[],
    wallet: Keypair,

    slippage: Percent,

    maxAmountB?: number,
}

export type RemoveAmmLiquidityInputInfo = {
    targetPool: string,
    removeLpTokenAmount: TokenAmount,    
    walletTokenAccounts: TokenAccount[],
    wallet: Keypair,
}

const addLookupTableInfo = LOOKUP_TABLE_CACHE

export class RaydiumManager {
    static wSolAddress = 'So11111111111111111111111111111111111111112';
    static RAYDIUM_PROGRAM_IDS = process.env.SOLANA_NETWORK=='devnet' ? DEVNET_PROGRAM_ID : MAINNET_PROGRAM_ID;
    static RAYDIUM_PUBLIC_KEY = this.RAYDIUM_PROGRAM_IDS.AmmV4;
    static ammFeeDestinationId = process.env.SOLANA_NETWORK=='devnet' ? '3XMrhbv989VxAMi3DErLV9eJht1pHppW5LbKxe9fkEFR' : '7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5';
    static OPENBOOK_PROGRAM_ID = "srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX";
    
    static ammKeysCache: { [key: string]: ApiPoolInfoV4 } = {};
    static async formatAmmKeysById(connection: web3.Connection, id: string, lpDecimals?: number, tokenMint?: string): Promise<ApiPoolInfoV4 | undefined> {
        try {
            if (this.ammKeysCache[id]) {
                console.log(new Date(), process.env.SERVER_NAME, 'formatAmmKeysById', 'get AMM keys from cache:', id);
                return this.ammKeysCache[id];
            }

            let account: web3.AccountInfo<Buffer> | null = null
            while (account === null) account = await connection.getAccountInfo(new PublicKey(id), 'processed')
            const info = LIQUIDITY_STATE_LAYOUT_V4.decode(account.data)
    
            const marketId = info.marketId
            let marketAccount: web3.AccountInfo<Buffer> | null = null
            while (marketAccount === null) marketAccount = await connection.getAccountInfo(marketId, 'processed')
            if (marketAccount === null) throw Error('get market info error')
            const marketInfo = MARKET_STATE_LAYOUT_V3.decode(marketAccount.data)

            if (lpDecimals == undefined){
                const lpMint = info.lpMint
                let lpMintAccount: web3.AccountInfo<Buffer> | null = null
                while (lpMintAccount === null) lpMintAccount = await connection.getAccountInfo(lpMint, 'processed')
                const lpMintInfo = SPL_MINT_LAYOUT.decode(lpMintAccount.data)
                lpDecimals = lpMintInfo.decimals;
            }
    
            const authority = Liquidity.getAssociatedAuthority({ programId: account.owner }).publicKey;
            const marketAuthority = Market.getAssociatedAuthority({ programId: info.marketProgramId, marketId: info.marketId }).publicKey;

            const ammKeys: ApiPoolInfoV4 = {
                id,
                baseMint: info.baseMint.toString(),
                quoteMint: info.quoteMint.toString(),
                lpMint: info.lpMint.toString(),
                baseDecimals: info.baseDecimal.toNumber(),
                quoteDecimals: info.quoteDecimal.toNumber(),
                lpDecimals: lpDecimals,
                version: 4,
                programId: account.owner.toString(),
                authority: authority.toString(),
                openOrders: info.openOrders.toString(),
                targetOrders: info.targetOrders.toString(),
                baseVault: info.baseVault.toString(),
                quoteVault: info.quoteVault.toString(),
                withdrawQueue: info.withdrawQueue.toString(),
                lpVault: info.lpVault.toString(),
                marketVersion: 3,
                marketProgramId: info.marketProgramId.toString(),
                marketId: info.marketId.toString(),
                marketAuthority: marketAuthority.toString(),
                marketBaseVault: marketInfo.baseVault.toString(),
                marketQuoteVault: marketInfo.quoteVault.toString(),
                marketBids: marketInfo.bids.toString(),
                marketAsks: marketInfo.asks.toString(),
                marketEventQueue: marketInfo.eventQueue.toString(),
                lookupTableAccount: PublicKey.default.toString()
            }

            this.ammKeysCache[id] = ammKeys;

            return ammKeys
        } catch (e) {
            console.log(e)
        }
    }

    static async swapOnlyAmm(connection: web3.Connection, input: SwapInputInfo): Promise<{ tx: VersionedTransaction, amountIn: number, amountOut: number, poolInfo: ApiPoolInfoV4 | undefined } | undefined> {
        console.log(new Date(), process.env.SERVER_NAME, 'swapOnlyAmm', input);
        try {
            // -------- pre-action: get pool info --------
            const targetPoolInfo = await this.formatAmmKeysById(connection, input.targetPool, input.lpDecimals, input.tokenMint);
            const poolKeys = jsonInfo2PoolKeys(targetPoolInfo) as LiquidityPoolKeys;

            let amountOut: BN | undefined;     

            let tokenAccountIn: web3.PublicKey;
            let tokenAccountOut: web3.PublicKey;

            const wsolAccount = input.walletTokenAccounts.find(a => a.accountInfo.mint.equals(Token.WSOL.mint));
            if (!wsolAccount){
                console.error(new Date(), process.env.SERVER_NAME, 'swapOnlyAmm', '!wsolAccount');
                return;
            }
            
            if (input.type == 'buy'){
                tokenAccountIn = wsolAccount.pubkey;
                tokenAccountOut = new PublicKey(input.tokenAta);

                if (input.fixedSide == 'out'){
                    // used to buy HONEYPOTS tokens

                    const poolInfo = await Liquidity.fetchInfo({ connection: connection, poolKeys })
                    const computeAmountOut = Liquidity.computeAmountOut({
                        poolKeys,
                        poolInfo,
                        amountIn: input.inputTokenAmount,
                        currencyOut: input.outputToken,
                        slippage: new Percent(1, 100),
                    });
                    console.log(new Date(), process.env.SERVER_NAME, 'swapOnlyAmm3', 'computeAmountOut:', computeAmountOut);
        
                    amountOut = computeAmountOut.amountOut.raw;
                }
            }
            else if (input.type == 'sell'){
                tokenAccountIn = new PublicKey(input.tokenAta);
                tokenAccountOut = wsolAccount.pubkey;
            }
            else {
                console.error(new Date(), 'swapOnlyAmm', 'input.type is not supported:', input.type);
                return;
            }

            if (input.amountIn == undefined){
                console.error(new Date(), 'swapOnlyAmm', '!input.amountIn');
                return;
            }

            let innerTransaction: {
                instructions: web3.TransactionInstruction[];
                signers: never[];
                lookupTableAddress: PublicKey[];
                instructionTypes: InstructionType[];
            } | undefined = undefined;
        
            if (input.fixedSide == 'in'){
                const res = Liquidity.makeSwapFixedInInstruction(
                    {
                        poolKeys: poolKeys,
                        userKeys: {
                            tokenAccountIn: tokenAccountIn,
                            tokenAccountOut: tokenAccountOut,
                            owner: input.wallet.publicKey,
                        },
                        amountIn: input.amountIn,
                        minAmountOut: 0,
                    },
                    poolKeys.version,
                );

                innerTransaction = res.innerTransaction;
            }
            else if (input.fixedSide == 'out'){
                if (input.maxAmountIn == undefined){
                    console.error(new Date(), 'swapOnlyAmm', '!input.maxAmountIn');
                    return;
                }
                if (amountOut == undefined){
                    console.error(new Date(), 'swapOnlyAmm', '!amountOut');
                    return;
                }
                const res = Liquidity.makeSwapFixedOutInstruction(
                    {
                        poolKeys: poolKeys,
                        userKeys: {
                            tokenAccountIn: tokenAccountIn,
                            tokenAccountOut: tokenAccountOut,
                            owner: input.wallet.publicKey,
                        },
                        amountOut: amountOut,
                        maxAmountIn: new BN(input.maxAmountIn),
                    },
                    poolKeys.version,
                );
                innerTransaction = res.innerTransaction;
            }

            if (!innerTransaction){
                console.error(new Date(), 'swapOnlyAmm', '!innerTransaction');
                return;
            }
    
            const instructions: web3.TransactionInstruction[] = []
    
            const microLamports = await HeliusManager.getRecentPrioritizationFees(false, input.sendThrough?.priority)
            instructions.push(
                web3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: microLamports }),
                web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 55_000 }),
            );

            // if there is no tokenAta account, we need to create one
            const tokenAccount = input.walletTokenAccounts.find(a => a.pubkey.toBase58() == input.tokenAta);
            if (!tokenAccount){
                instructions.push(
                    await SolanaManager.createSplAccountInstruction(
                        new PublicKey(input.tokenMint),
                        input.wallet.publicKey,
                        input.wallet.publicKey,
                        new PublicKey(input.tokenAta),
                    )
                );
            }


            instructions.push(...innerTransaction.instructions);
            const blockhash = (await SolanaManager.getRecentBlockhash()).blockhash;
            const tx = await SolanaManager.createVersionedTransaction(instructions, input.wallet, blockhash, false);

            await SolanaManager.signAndSendTx(tx, input.wallet, input.sendThrough);

            return {
                tx: tx, 
                amountIn: input.amountIn?.toNumber() || input.maxAmountIn || 0, 
                amountOut: amountOut ? amountOut.toNumber() : 0, 
                poolInfo: targetPoolInfo 
            };

        }
        catch (e) {
            console.error(e)
            return undefined
        }
    }

    static async buildAndSendTx(connection: web3.Connection, innerSimpleV0Transaction: InnerSimpleV0Transaction[], wallet: Keypair, sendThrough?: SendThrough): Promise<(VersionedTransaction | Transaction)[]> {
        console.log('buildAndSendTx innerSimpleV0Transaction.length', innerSimpleV0Transaction.length)
        const txs = await buildSimpleTransaction({
            connection: connection,
            makeTxVersion: TxVersion.V0,
            payer: wallet.publicKey,
            innerTransactions: innerSimpleV0Transaction,
            addLookupTableInfo,
        });
    
        console.log('buildAndSendTx txs.length', txs.length)

        for (const tx of txs) {
            if (tx instanceof VersionedTransaction) {
                tx.sign([wallet]);

                if (sendThrough?.useJito){
                    console.log(new Date(), process.env.SERVER_NAME, 'buildAndSendTx', 'sendThrough.useJito', 'sendTransaction');
                    JitoManager.sendTransaction(tx, wallet, true, tx.message.recentBlockhash, sendThrough?.priority);
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
        }

        return txs;
    }

    static async buyTokenForSOL(keypair: web3.Keypair, mint: string, decimals: number, poolId: string, solAmount: number, fixedSide: 'in' | 'out', tokenAta: string, maxAmountIn?: number, sendThrough?: SendThrough): Promise<{ tx: VersionedTransaction, amountIn: number, amountOut: number, poolInfo: ApiPoolInfoV4 | undefined } | undefined> {
        console.log(new Date(), process.env.SERVER_NAME, 'buyTokenForSOL', 'mint:', mint, 'decimals:', decimals, 'poolId:', poolId, 'solAmount:', solAmount);
        const inputToken = Token.WSOL;
        const amountIn = Math.floor(solAmount * web3.LAMPORTS_PER_SOL);
        const outputToken = new Token(TOKEN_PROGRAM_ID, new web3.PublicKey(mint), decimals);
        const inputTokenAmount = new TokenAmount(inputToken, amountIn)

        // buy this token for SOL
        const connection = newConnection();
        const walletTokenAccounts = await SolanaManager.getWalletTokenAccounts(connection, keypair.publicKey);
        //TODO: for honeypots I think we need to create a new token account for the token we are buying
        //await this.getWalletTokensAccountsForToken(mint, keypair.publicKey, new BN(0), tokenAta);

        const swapParams: SwapInputInfo = {
            type: 'buy',
            outputToken: outputToken,
            targetPool: poolId,
            inputTokenAmount: inputTokenAmount,
            walletTokenAccounts: walletTokenAccounts,
            wallet: keypair,
            lpDecimals: decimals,
            fixedSide: fixedSide,
            sendThrough: sendThrough,
            tokenAta: tokenAta,
            tokenMint: mint,

            amountIn: new BN(amountIn),
            maxAmountIn: maxAmountIn || amountIn * 3,
        };
        const response = await RaydiumManager.swapOnlyAmm(connection, swapParams);
        return response;
    }

    static async sellTokenForSOL(keypair: web3.Keypair, mint: string, decimals: number, poolId: string, tokenAmount: BN, fixedSide: 'in' | 'out', tokenAta: string, sendThrough?: SendThrough): Promise<{ tx: VersionedTransaction, amountIn: number, amountOut: number, poolInfo: ApiPoolInfoV4 | undefined } | undefined> {
        console.log(new Date(), process.env.SERVER_NAME, 'sellTokenForSOL', 'mint:', mint, 'decimals:', decimals, 'poolId:', poolId, 'tokenAmount:', tokenAmount.toString());
        const inputToken = new Token(TOKEN_PROGRAM_ID, new web3.PublicKey(mint), decimals);
        const outputToken = Token.WSOL;
        const inputTokenAmount = new TokenAmount(inputToken, tokenAmount);

        // buy this token for SOL
        const connection = newConnection();

        console.log(new Date(), process.env.SERVER_NAME, 'sellTokenForSOL', 'tokenAmount', tokenAmount.toString(), 'decimals', decimals);
        const walletTokenAccounts = await SolanaManager.getWalletTokenAccounts(connection, keypair.publicKey);

        //TODO: we still need this for honeypots
        // await this.getWalletTokensAccountsForToken(mint, keypair.publicKey, tokenAmount, tokenAta);

        console.log(new Date(), process.env.SERVER_NAME, 'sellTokenForSOL', 'walletTokenAccounts:', JSON.stringify(walletTokenAccounts, null, 2));

        const swapParams: SwapInputInfo = {
            type: 'sell',
            outputToken: outputToken,
            targetPool: poolId,
            inputTokenAmount: inputTokenAmount,
            walletTokenAccounts: walletTokenAccounts,
            wallet: keypair,
            lpDecimals: decimals,
            fixedSide: fixedSide,
            sendThrough: sendThrough,
            tokenAta: tokenAta,
            tokenMint: mint,

            amountIn: tokenAmount,
        };

        const response = await RaydiumManager.swapOnlyAmm(connection, swapParams);
        return response;
    }

    static async fetchPoolInfoForToken(connection: Connection, mintAddress: string): Promise<{id: string, decimals: number} | undefined> {
        const base = new web3.PublicKey(mintAddress);
        const quote = new web3.PublicKey(this.wSolAddress);
        console.log(new Date(), process.env.SERVER_NAME, 'fetchPoolInfoForToken', 'Token:', mintAddress, 'fetchPoolInfoForToken');
        const markets = await RaydiumManager.fetchMarketAccounts(connection, base, quote);
        console.log(new Date(), process.env.SERVER_NAME, 'Token:', mintAddress, 'MARKET ACCOUNTS:', markets.length);
        if (markets.length == 0) return;

        const pInfo = markets[0];
        console.log(new Date(), process.env.SERVER_NAME, 'pInfo', pInfo);
        return {id: pInfo.id, decimals: pInfo.baseDecimal.toNumber()};
    }

    static async fetchMarketAccounts(connection: Connection, base: PublicKey, quote: PublicKey, commitment: web3.Commitment = 'confirmed') {
        console.log(new Date(), process.env.SERVER_NAME, 'fetchMarketAccounts START');
        const accounts = await connection.getProgramAccounts(
            this.RAYDIUM_PUBLIC_KEY,
            {
                commitment,
                filters: [
                { dataSize: LIQUIDITY_STATE_LAYOUT_V4.span },
                {
                    memcmp: {
                        offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf("baseMint"),
                        bytes: base.toBase58(),
                    },
                },
                {
                    memcmp: {
                        offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf("quoteMint"),
                        bytes: quote.toBase58(),
                    },
                },
                ],
            }
        );
        console.log(new Date(), process.env.SERVER_NAME, 'fetchMarketAccounts END');

    
        return accounts.map(({ pubkey, account }) => ({
            id: pubkey.toString(),
            ...LIQUIDITY_STATE_LAYOUT_V4.decode(account.data),
        }));
    }

    static async ammAddLiquidity(input: AddAmmLiquidityInputInfo): Promise<{ txs: web3.VersionedTransaction[] } | undefined> {
        const connection = newConnection();
        const targetPoolInfo = await this.formatAmmKeysById(connection, input.targetPool)
        if (!targetPoolInfo){ console.error('!targetPoolInfo'); return; }
      
        // -------- step 1: compute another amount --------
        const poolKeys = jsonInfo2PoolKeys(targetPoolInfo) as LiquidityPoolKeys
        let amountInB: TokenAmount | CurrencyAmount | undefined;

        if (input.maxAmountB == undefined){
            const extraPoolInfo = await Liquidity.fetchInfo({ connection, poolKeys })
            const { maxAnotherAmount, anotherAmount, liquidity } = Liquidity.computeAnotherAmount({
                poolKeys,
                poolInfo: { ...targetPoolInfo, ...extraPoolInfo },
                amount: input.inputTokenAmount,
                anotherCurrency: input.quoteToken,
                slippage: input.slippage,
            })
        
            console.log('will add liquidity info', {
                liquidity: liquidity.toString(),
                liquidityD: new Decimal(liquidity.toString()).div(10 ** extraPoolInfo.lpDecimals),
            });

            amountInB = maxAnotherAmount;

        }
        else{
            amountInB = new TokenAmount(input.quoteToken, new BN(input.maxAmountB || 0));
        }

        // -------- step 2: make instructions --------
        const addLiquidityInstructionResponse = await Liquidity.makeAddLiquidityInstructionSimple({
            connection,
            poolKeys,
            userKeys: {
                owner: input.wallet.publicKey,
                payer: input.wallet.publicKey,
                tokenAccounts: input.walletTokenAccounts,
            },
            amountInA: input.inputTokenAmount,
            amountInB: amountInB,
            fixedSide: 'a',
            makeTxVersion: TxVersion.V0,
            computeBudgetConfig: {
                units: 300_000,
                microLamports: await HeliusManager.getRecentPrioritizationFees(),
            }
        });

        const sendThrough: SendThrough | undefined = undefined;      
        const txs = await this.buildAndSendTx(connection, addLiquidityInstructionResponse.innerTransactions, input.wallet, sendThrough);
        return { txs: txs as VersionedTransaction[] };
    }

    static async ammRemoveLiquidity(input: RemoveAmmLiquidityInputInfo) {
        // -------- pre-action: fetch basic info --------
        const connection = newConnection();
        const targetPoolInfo = await this.formatAmmKeysById(connection, input.targetPool)
        if (!targetPoolInfo){ console.error('!targetPoolInfo'); return; }

        // -------- step 1: make instructions --------
        const poolKeys = jsonInfo2PoolKeys(targetPoolInfo) as LiquidityPoolKeys
        const removeLiquidityInstructionResponse = await Liquidity.makeRemoveLiquidityInstructionSimple({
            connection,
            poolKeys,
            userKeys: {
                owner: input.wallet.publicKey,
                payer: input.wallet.publicKey,
                tokenAccounts: input.walletTokenAccounts,
            },
            amountIn: input.removeLpTokenAmount,
            makeTxVersion: TxVersion.V0,
            computeBudgetConfig: {
                units: 300_000,
                microLamports: await HeliusManager.getRecentPrioritizationFees(),
            }
        })

        const sendThrough: SendThrough | undefined = undefined;      
        const txs = await this.buildAndSendTx(connection, removeLiquidityInstructionResponse.innerTransactions, input.wallet, sendThrough);
        return { txs: txs as VersionedTransaction[] };
    }

    static async calcSellPrice(targetPoolInfo: ApiPoolInfoV4, mintAddress: string, decimals: number, amount: BN): Promise<number | undefined> {
        try {

            const connection = newConnection();
            // -------- pre-action: get pool info --------
            const poolKeys = jsonInfo2PoolKeys(targetPoolInfo) as LiquidityPoolKeys;

            let amountOut: CurrencyAmount | TokenAmount | undefined;
            let minAmountOut: CurrencyAmount | TokenAmount | undefined;

            const poolInfo = await Liquidity.fetchInfo({ connection: connection, poolKeys })

            const inputToken = new Token(TOKEN_PROGRAM_ID, new web3.PublicKey(mintAddress), decimals);
            const inputTokenAmount = new TokenAmount(inputToken, amount);

            const computeAmountOut = Liquidity.computeAmountOut({
                poolKeys,
                poolInfo,
                amountIn: inputTokenAmount,
                currencyOut: Token.WSOL,
                slippage: new Percent(100, 100)
            });

            amountOut = computeAmountOut.amountOut;
            minAmountOut = computeAmountOut.minAmountOut;

            return +amountOut.toExact();
        }
        catch (e) {
            console.error(e);
        }
        return undefined;
    }

    static async getWalletTokensAccountsForToken(mint: string, owner: web3.PublicKey, bnAmount: BN, tokenAta?: string, state = 1): Promise<TokenAccount[]> {
        const connection = newConnection();

        const allTokenAccounts = await SolanaManager.getWalletTokenAccounts(connection, owner);
        const wsolAccount = allTokenAccounts.find(a => a.accountInfo.mint.equals(Token.WSOL.mint));
        console.log(new Date(), process.env.SERVER_NAME, 'getWalletTokensAccountsForToken', 'wsolAccount:', wsolAccount);
        let walletTokenAccounts: TokenAccount[];
        
        if (tokenAta){
            walletTokenAccounts = [
                {
                    programId: TOKEN_PROGRAM_ID,
                    pubkey: new PublicKey(tokenAta),
                    accountInfo: {
                        "mint": new PublicKey(mint),
                        "owner": owner,
                        "amount": bnAmount,
                        "delegateOption": 0,
                        "delegate": new PublicKey("11111111111111111111111111111111"),
                        "state": state, // 1 or 2??
                        "isNativeOption": 0,
                        "isNative": new BN("00"),
                        "delegatedAmount": new BN("00"),
                        "closeAuthorityOption": 0,
                        "closeAuthority": new PublicKey("11111111111111111111111111111111"),
                    }
                }
            ];
            if (wsolAccount){
                walletTokenAccounts.push(wsolAccount);
            }
        }
        else{
            walletTokenAccounts = allTokenAccounts;
        }

        return walletTokenAccounts;
    }

    static async parsePoolInfo(poolId: string): Promise<{sol: web3.TokenAmount, token: web3.TokenAmount, lpReserve: string} | undefined> {
        try {
            const connection = newConnection();
            const owner = new PublicKey("VnxDzsZ7chE88e9rB6UKztCt2HUwrkgCTx8WieWf5mM");

            const tokenAccounts = await SolanaManager.getWalletTokenAccounts(connection, owner)

            // example to get pool info
            const info = await connection.getAccountInfo(new PublicKey(poolId));
            if (!info) { return undefined; };

            const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(info.data);
            const openOrders = await OpenOrders.load(
                connection,
                poolState.openOrders,
                new web3.PublicKey(this.OPENBOOK_PROGRAM_ID),
            );

            const baseDecimal = 10 ** poolState.baseDecimal.toNumber(); 
            const quoteDecimal = 10 ** poolState.quoteDecimal.toNumber();

            const baseTokenAmount = await connection.getTokenAccountBalance(
                poolState.baseVault
            );
            const quoteTokenAmount = await connection.getTokenAccountBalance(
                poolState.quoteVault
            );

            const basePnl = poolState.baseNeedTakePnl.toNumber() / baseDecimal;
            const quotePnl = poolState.quoteNeedTakePnl.toNumber() / quoteDecimal;

            const openOrdersBaseTokenTotal =
                openOrders.baseTokenTotal.toNumber() / baseDecimal;
            const openOrdersQuoteTokenTotal =
                openOrders.quoteTokenTotal.toNumber() / quoteDecimal;

            const base =
                (baseTokenAmount.value?.uiAmount || 0) + openOrdersBaseTokenTotal - basePnl;
            const quote =
                (quoteTokenAmount.value?.uiAmount || 0) +
                openOrdersQuoteTokenTotal -
                quotePnl;

            const denominator = new BN(10).pow(poolState.baseDecimal);

            const addedLpAccount = tokenAccounts.find((a) =>
                a.accountInfo.mint.equals(poolState.lpMint)
            );

            console.log(
                "!!! Pool info:",
                "pool total base " + base,
                "pool total quote " + quote,

                "base vault balance " + baseTokenAmount.value.uiAmount,
                "quote vault balance " + quoteTokenAmount.value.uiAmount,

                "base tokens in openorders " + openOrdersBaseTokenTotal,
                "quote tokens in openorders  " + openOrdersQuoteTokenTotal,

                "base token decimals " + poolState.baseDecimal.toNumber(),
                "quote token decimals " + poolState.quoteDecimal.toNumber(),
                "total lp " + poolState.lpReserve.div(denominator).toString(),

                "addedLpAmount " +
                (addedLpAccount?.accountInfo.amount.toNumber() || 0) / baseDecimal
            );

            // console.log(new Date(), process.env.SERVER_NAME, '!!! Pool info:', {base, quote, baseTokenAmount, quoteTokenAmount, openOrdersBaseTokenTotal, openOrdersQuoteTokenTotal, poolState});

            return {
                'sol': quoteTokenAmount.value,
                'token': baseTokenAmount.value,
                lpReserve: poolState.lpReserve.div(denominator).toString(),
            }
        }
        catch (error) {
            console.log(new Date(), process.env.SERVER_NAME, 'parsePoolInfo', 'error:', error);
        }

        return undefined;
    }

    // static async getMyExpectedPoolAmounts(honeypotToken: ISnipedToken, lpTokenAmount: number): Promise<{sol: number, token: number}> {
    //     const poolAmounts = await RaydiumManager.parsePoolInfo(honeypotToken.poolId);
    //     if (!poolAmounts){
    //         return {sol: 0, token: 0};
    //     }

    //     const totalTokensInPool = +poolAmounts.token.amount;//akA: total BONK in pool
    //     const totalLpMintSupply = +poolAmounts.lpReserve;
    //     const myPartOfLP = (lpTokenAmount / (10**honeypotToken.decimals))/totalLpMintSupply;
    //     const expectedTokensAmount =  Math.floor(totalTokensInPool * myPartOfLP) / (10 ** honeypotToken.decimals);//akA: expected BONK amount
    //     const expectedSolAmount = Math.floor((+poolAmounts.sol.amount) * myPartOfLP) / web3.LAMPORTS_PER_SOL;//akA: expected BONK amount
    //     return {sol: expectedSolAmount, token: expectedTokensAmount};
    // }

    static decodeRaydiumSwapInstruction(data: Buffer): RaydiumSwapInstructionData {
        const instructionType = data.readUInt8(0);
        const result: RaydiumSwapInstructionData = {
            instructionType
        };

        if (instructionType == 9){
            result.amountIn = data.readBigUInt64LE(1);
            result.minAmountOut = data.readBigUInt64LE(9);
        }
        else if (instructionType == 11){
            result.maxAmountIn = data.readBigUInt64LE(1);
            result.amountOut = data.readBigUInt64LE(9);
        }
        else {
            //TODO: this is for instructionType=9 and instructionType=11. 
            // I'll need to implement other types as well
            //instructionType=9 is Swap instruction when you have fixed amountIn and minAmountOut        
            //instructionType=11 is Swap instruction when you have fixed maxAmountIn and amountOut        
        }

        return result;
    }

}