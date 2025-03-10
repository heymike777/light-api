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
import { SearchManager } from "../../managers/SearchManager";

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
        const tokens = await SearchManager.search(query, userId);

        res.status(200).send({ query, tokens });
    }
);

export { router as searchRouter };
