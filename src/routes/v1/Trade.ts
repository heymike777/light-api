import express, { Request, Response } from "express";
import jwt from "express-jwt";
import { validateAuth } from "../../middlewares/ValidateAuth";
import { NotAuthorizedError } from "../../errors/NotAuthorizedError";
import { validateRequest } from "../../middlewares/ValidateRequest";
import { body } from "express-validator";
import { SwapManager } from "../../managers/SwapManager";
import { SwapDex } from "../../entities/payments/Swap";
import { Chain } from "../../services/solana/types";

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
        const chain = Chain.SOLANA; //TODO: get chain - by mint? or front should send it?
        const { signature, swap } = await SwapManager.initiateBuy(chain, SwapDex.JUPITER, traderProfileId, mint, amount);

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
        const chain = Chain.SOLANA; //TODO: get chain - by mint? or front should send it?
        const { signature, swap } = await SwapManager.initiateSell(chain, SwapDex.JUPITER, traderProfileId, mint, amount);

        res.status(200).send({ success: signature ? true : false, signature });
    }
);


export { router as tradeRouter };
