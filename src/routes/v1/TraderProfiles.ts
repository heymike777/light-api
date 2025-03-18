import express, { Request, Response } from "express";
import jwt from "express-jwt";
import { validateAuth } from "../../middlewares/ValidateAuth";
import { NotAuthorizedError } from "../../errors/NotAuthorizedError";
import { body } from "express-validator";
import { validateRequest } from "../../middlewares/ValidateRequest";
import { FirebaseManager } from "../../managers/FirebaseManager";
import { Helpers } from "../../services/helpers/Helpers";
import { PageToken } from "../../models/PageToken";
import { UserTransaction } from "../../entities/users/UserTransaction";
import { WalletManager } from "../../managers/WalletManager";
import { ExplorerManager } from "../../services/explorers/ExplorerManager";
import { UserManager } from "../../managers/UserManager";
import { ProgramManager } from "../../managers/ProgramManager";
import { SwapManager } from "../../managers/SwapManager";
import { BadRequestError } from "../../errors/BadRequestError";
import { User } from "../../entities/users/User";
import { Announcement, AnnouncementsManager } from "../../managers/AnnouncementsManager";
import { token } from "@coral-xyz/anchor/dist/cjs/utils";
import { TokenManager } from "../../managers/TokenManager";
import { LogManager } from "../../managers/LogManager";
import { UserTraderProfile } from "../../entities/users/TraderProfile";
import { Priority, WalletModel } from "../../services/solana/types";
import { SolanaManager } from "../../services/solana/SolanaManager";
import { PremiumError } from "../../errors/PremiumError";
import { TraderProfilesManager } from "../../managers/TraderProfilesManager";
import { YellowstoneManager } from "../../services/solana/geyser/YellowstoneManager";
import { Wallet } from "../../entities/Wallet";
import fs from "fs";

const router = express.Router();

router.get(
    '/api/v1/users/:userId/traderProfiles',
    jwt({ secret: process.env.JWT_SECRET_KEY!, algorithms: [process.env.JWT_ALGORITHM], credentialsRequired: true }),
    validateAuth(),  
    async (req: Request, res: Response) => {
        const userId = req.accessToken?.userId;
        if (!userId){
            throw new NotAuthorizedError();
        }

        const traderProfiles = await TraderProfilesManager.getUserTraderProfiles(userId);
    
        res.status(200).send({ traderProfiles });
    }
);

router.post(
    '/api/v1/users/:userId/traderProfiles',
    [
        body("engineId").isIn(SwapManager.engines.map((engine) => engine.id)).withMessage("engineId is not valid"),
        body("title").notEmpty().withMessage("title is required"),
        body("defaultAmount").optional().isNumeric().withMessage("defaultAmount is not valid"),
        body("slippage").optional().isNumeric().withMessage("defaultAmount is not valid"),
    ],
    validateRequest,
    jwt({ secret: process.env.JWT_SECRET_KEY!, algorithms: [process.env.JWT_ALGORITHM], credentialsRequired: true }),
    validateAuth(),  
    async (req: Request, res: Response) => {
        const userId = req.accessToken?.userId;
        if (!userId){
            throw new NotAuthorizedError();
        }
        const ipAddress = Helpers.getIpAddress(req);

        const user = await UserManager.getUserById(userId, true);
        if (!user){
            throw new NotAuthorizedError();
        }

        const engineId = '' + req.body.engineId;
        const title = '' + req.body.title;
        const priorityFee: Priority | undefined = req.body.priorityFee;
        let defaultAmount: number | undefined;
        let slippage: number | undefined;

        const engine = SwapManager.engines.find((e) => e.id === engineId);
        if (!engine){
            throw new BadRequestError("Engine not found");
        }

        if (engine.isSubscriptionRequired && !user.subscription){
            throw new PremiumError("Subscription is required to create this trader");
        }

        if (engineId == SwapManager.kNativeEngineId){
            if (!req.body.defaultAmount){
                throw new BadRequestError("defaultAmount is not valid");
            }
            if (!req.body.slippage){
                throw new BadRequestError("slippage is not valid");
            }

            defaultAmount = +req.body.defaultAmount;
            slippage = +req.body.slippage;
        }

        const traderProfile = await TraderProfilesManager.createTraderProfile(user, engineId, title, priorityFee || Priority.MEDIUM, defaultAmount, slippage, ipAddress);

        res.status(200).send({ traderProfile });
    }
);

router.put(
    '/api/v1/users/:userId/traderProfiles/:traderProfileId',
    [
        body("title").optional().notEmpty().withMessage("title is required"),
        body("defaultAmount").optional().isNumeric().withMessage("defaultAmount is not valid"),
        body("slippage").optional().isNumeric().withMessage("defaultAmount is not valid"),
        body("default").optional().isBoolean().withMessage("default is not valid"),
    ],
    validateRequest,
    jwt({ secret: process.env.JWT_SECRET_KEY!, algorithms: [process.env.JWT_ALGORITHM], credentialsRequired: true }),
    validateAuth(),  
    async (req: Request, res: Response) => {
        const userId = req.accessToken?.userId;
        if (!userId){
            throw new NotAuthorizedError();
        }

        const traderProfileId = req.params.traderProfileId;
        const traderProfile = await TraderProfilesManager.findById(traderProfileId);
        if (!traderProfile){
            throw new BadRequestError("Trader not found");
        }

        if (traderProfile.userId != userId){
            throw new BadRequestError("Trader not found");
        }

        if (req.body.title){
            traderProfile.title = req.body.title;

            // update wallet title
            const wallet = await Wallet.findOne({ traderProfileId: traderProfileId });
            if (wallet){
                wallet.title = traderProfile.title;
                await wallet.save();
                WalletManager.addWalletToCache(wallet);
            }        
        }

        if (req.body.defaultAmount){
            traderProfile.defaultAmount = +req.body.defaultAmount;
        }

        if (req.body.slippage){
            traderProfile.buySlippage = +req.body.slippage;
        }

        if (req.body.priorityFee){
            traderProfile.priorityFee = req.body.priorityFee;
        }

        if (req.body.default != undefined){
            traderProfile.default = req.body.default as boolean;

            // make all other user profiles default = false
            await UserTraderProfile.updateMany({ userId: userId }, { $set: { default: false } });
        }

        await traderProfile.save();

        res.status(200).send({ traderProfile });
    }
);

router.delete(
    '/api/v1/users/:userId/traderProfiles/:traderProfileId',
    jwt({ secret: process.env.JWT_SECRET_KEY!, algorithms: [process.env.JWT_ALGORITHM], credentialsRequired: true }),
    validateAuth(),  
    async (req: Request, res: Response) => {
        const userId = req.accessToken?.userId;
        if (!userId){
            throw new NotAuthorizedError();
        }
        const ipAddress = Helpers.getIpAddress(req);

        const traderProfileId = req.params.traderProfileId;
        
        await TraderProfilesManager.deactivateTraderProfile(traderProfileId, userId, ipAddress);

        res.status(200).send({ success: true });
    }
);

router.get(
    '/api/v1/users/:userId/traderProfiles/:traderProfileId/export',
    jwt({ secret: process.env.JWT_SECRET_KEY!, algorithms: [process.env.JWT_ALGORITHM], credentialsRequired: true }),
    validateAuth(),  
    async (req: Request, res: Response) => {
        const userId = req.accessToken?.userId;
        if (!userId){
            throw new NotAuthorizedError();
        }

        const traderProfileId = req.params.traderProfileId;
        const traderProfile = await TraderProfilesManager.findById(traderProfileId);
        if (!traderProfile){
            throw new BadRequestError("Trader not found");
        }

        if (traderProfile.userId != userId){
            throw new BadRequestError("Trader not found");
        }

        if (traderProfile.engineId != SwapManager.kNativeEngineId){
            throw new BadRequestError("Only light engine is supported for export");
        }

        res.status(200).send({ privateKey: traderProfile.wallet?.privateKey });
    }
);


export { router as traderProfilesRouter };
