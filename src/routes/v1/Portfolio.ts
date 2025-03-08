import express, { Request, Response } from "express";
import jwt from "express-jwt";
import { validateAuth } from "../../middlewares/ValidateAuth";
import { NotAuthorizedError } from "../../errors/NotAuthorizedError";
import { body } from "express-validator";
import { validateRequest } from "../../middlewares/ValidateRequest";
import { Helpers } from "../../services/helpers/Helpers";
import { SwapManager } from "../../managers/SwapManager";
import { BadRequestError } from "../../errors/BadRequestError";
import { TokenManager } from "../../managers/TokenManager";
import { SolanaManager } from "../../services/solana/SolanaManager";
import { TraderProfilesManager } from "../../managers/TraderProfilesManager";
import { PortfolioAsset } from "../../models/types";
import { kSolAddress } from "../../services/solana/Constants";

const router = express.Router();

router.get(
    '/api/v1/portfolio',
    [
        body("traderProfileId").optional().notEmpty().withMessage("traderProfileId is not valid"),
    ],
    validateRequest,
    jwt({ secret: process.env.JWT_SECRET_KEY!, algorithms: [process.env.JWT_ALGORITHM], credentialsRequired: true }),
    validateAuth(),  
    async (req: Request, res: Response) => {
        const userId = req.accessToken?.userId;
        if (!userId){
            throw new NotAuthorizedError();
        }

        const traderProfileId = req.query.traderProfileId ? '' + req.query.traderProfileId : undefined;

        let traderProfiles = await TraderProfilesManager.getUserTraderProfiles(userId, SwapManager.kNativeEngineId);
        let traderProfile = traderProfileId ? traderProfiles.find(tp => tp.id == traderProfileId) : traderProfiles.find(tp => tp.default) || traderProfiles[0];

        const { values, assets, warning } = await TraderProfilesManager.getPortfolio(traderProfile);

        for (const asset of assets) {
            asset.amount = asset.uiAmount;
            asset.uiAmount = 0;
        }

        res.status(200).send({ warning, traderProfiles, traderProfile, values, assets });
    }
);

export { router as portfolioRouter };
