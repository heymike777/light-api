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
import { Currency } from "../../models/types";

const router = express.Router();

router.post(
    '/api/v1/trade/buy',
    [
        body("traderProfileId").notEmpty().withMessage("traderProfileId is not valid"),
        body("amount").isNumeric().withMessage("amount is not valid"),
        body("mint").notEmpty().withMessage("mint is not valid"),
    ],
    validateRequest,
    jwt({ secret: process.env.JWT_SECRET_KEY!, algorithms: [process.env.JWT_ALGORITHM], credentialsRequired: true }),
    validateAuth(),
    async (req: Request, res: Response) => {
        const userId = req.accessToken?.userId;
        if (!userId){
            throw new NotAuthorizedError();
        }

        const { traderProfileId, amount, mint } = req.body;
        const signature = await SwapManager.initiateBuy(SwapDex.JUPITER, traderProfileId, mint, amount);

        res.status(200).send({ success: signature ? true : false, signature });
    }
);

router.post(
    '/api/v1/trade/sell',
    [
        body("traderProfileId").notEmpty().withMessage("traderProfileId is not valid"),
        body("amount").isNumeric().withMessage("amount is not valid"),
        body("mint").notEmpty().withMessage("mint is not valid"),
    ],
    validateRequest,
    jwt({ secret: process.env.JWT_SECRET_KEY!, algorithms: [process.env.JWT_ALGORITHM], credentialsRequired: true }),
    validateAuth(),
    async (req: Request, res: Response) => {
        const userId = req.accessToken?.userId;
        if (!userId){
            throw new NotAuthorizedError();
        }

        const { traderProfileId, amount, mint } = req.body;
        const signature = await SwapManager.initiateSell(SwapDex.JUPITER, traderProfileId, mint, amount);

        res.status(200).send({ success: signature ? true : false, signature });
    }
);


export { router as tradeRouter };
