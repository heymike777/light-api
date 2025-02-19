import express, { Request, Response } from "express";
import jwt from "express-jwt";
import { validateAuth } from "../../middlewares/ValidateAuth";
import { NotAuthorizedError } from "../../errors/NotAuthorizedError";
import { validateRequest } from "../../middlewares/ValidateRequest";
import { body } from "express-validator";
import { TraderProfilesManager } from "../../managers/TraderProfilesManager";
import { BadRequestError } from "../../errors/BadRequestError";
import { SwapManager } from "../../managers/SwapManager";
import { StatusType, Swap, SwapDex, SwapType } from "../../entities/payments/Swap";
import { SolanaManager } from "../../services/solana/SolanaManager";
import { newConnection } from "../../services/solana/lib/solana";
import { kSolAddress } from "../../services/solana/Constants";
import { BN } from "bn.js";
import { IToken, ITokenModel, Token, tokenToTokenModel } from "../../entities/tokens/Token";
import { RedisManager } from "../../managers/db/RedisManager";
import { TokenManager } from "../../managers/TokenManager";

const router = express.Router();

router.post(
    '/api/v1/search',
    [
        body("query").notEmpty().withMessage("query is not valid"),
    ],
    validateRequest,
    jwt({ secret: process.env.JWT_SECRET_KEY!, algorithms: [process.env.JWT_ALGORITHM], credentialsRequired: true }),
    validateAuth(),
    async (req: Request, res: Response) => {
        const userId = req.accessToken?.userId;
        if (!userId){
            throw new NotAuthorizedError();
        }

        const query = '' + req.body.query;
        let mint: string | undefined = undefined;
        let pairId: string | undefined = undefined;

        // check if query is a valid token mint address
        const isValidPublicKey = SolanaManager.isValidPublicKey(query);
        if (isValidPublicKey){
            mint = query;
            pairId = query;
        }
        
        // pump.fun link
        if (!mint && !pairId && query.startsWith('https://pump.fun/coin/')){
            const queryTmp = query.replace('https://pump.fun/coin/', '');
            const parts = queryTmp.split('?');
            if (parts.length > 0){
                mint = parts[0];
            }
        }

        // dexscreener link = https://dexscreener.com/solana/6ofwm7kplfxnwmb3z5xwboxnspp3jjyirapqpsivcnsp?t=1739912495229 
        // where id is token pair address
        if (!mint && !pairId && query.startsWith('https://dexscreener.com/solana/')){
            const queryTmp = query.replace('https://dexscreener.com/solana/', '');
            const parts = queryTmp.split('?');
            if (parts.length > 0){
                pairId = parts[0];
            }
        }
                
        // dextools link = https://www.dextools.io/app/en/solana/pair-explorer/7rdaE1HNeBKxdyCQ4z9tNaYrYH4goFEQo3kCWA4nVrQg?t=1739912495229
        // where id is token pair address
        if (!mint && !pairId && query.startsWith('https://www.dextools.io/app/en/solana/pair-explorer/')){
            const queryTmp = query.replace('https://www.dextools.io/app/en/solana/pair-explorer/', '');
            const parts = queryTmp.split('?');
            if (parts.length > 0){
                pairId = parts[0];
            }
        }

        const tokens: ITokenModel[] = [];

        if (mint){
            const token = await TokenManager.getToken(mint);
            if (token){
                tokens.push(token);
            }
        }
        
        if (pairId){
            const pairTokens = await TokenManager.getTokensByPair(pairId);
            if (pairTokens && pairTokens.length > 0){
                tokens.push(...pairTokens);
            }
        }
        
        if (tokens.length === 0){
            const tmpTokens = await Token.find({ symbol: { $regex : new RegExp(query, "i") } });
            if (tmpTokens && tmpTokens.length > 0){
                tokens.push(...(tmpTokens.map(token => tokenToTokenModel(token))));
            }
        }

        res.status(200).send({ query, tokens });
    }
);

export { router as searchRouter };
