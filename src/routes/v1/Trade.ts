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

        const swap = new Swap();
        swap.type = SwapType.BUY;
        swap.dex = SwapDex.JUPITER;
        swap.userId = userId;
        swap.traderProfileId = traderProfileId;
        swap.amountIn = amount;
        swap.mint = mint;
        swap.createdAt = new Date();
        swap.status = {
            type: StatusType.CREATED,
            tryIndex: 0,
        };
        await swap.save();


        const signature = await SwapManager.buy(swap, traderProfile);

        res.status(200).send({ success: signature ? true : false, signature });
    }
);

export { router as tradeRouter };
