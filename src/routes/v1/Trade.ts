import express, { Request, Response } from "express";
import jwt from "express-jwt";
import { validateAuth } from "../../middlewares/ValidateAuth";
import { NotAuthorizedError } from "../../errors/NotAuthorizedError";
import { validateRequest } from "../../middlewares/ValidateRequest";
import { body } from "express-validator";
import { TraderProfilesManager } from "../../managers/TraderProfilesManager";
import { BadRequestError } from "../../errors/BadRequestError";
import { SwapManager } from "../../managers/SwapManager";

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

        const traderProfile = await TraderProfilesManager.findById(traderProfileId);
        if (!traderProfile){
            throw new BadRequestError('Trader profile not found');
        }

        if (traderProfile.engineId !== SwapManager.kNaviteEngineId){
            throw new BadRequestError('Only Light engine is supported');
        }

        const resp = await SwapManager.buy(traderProfile, mint, amount);

        res.status(200).send({ success: true });
    }
);

export { router as tradeRouter };
