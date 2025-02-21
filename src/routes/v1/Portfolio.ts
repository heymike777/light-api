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
import { TokenManager, TokenTag } from "../../managers/TokenManager";
import { LogManager } from "../../managers/LogManager";
import { IUserTraderProfile, UserTraderProfile } from "../../entities/users/TraderProfile";
import { WalletModel } from "../../services/solana/types";
import { Asset, SolanaManager } from "../../services/solana/SolanaManager";
import { PremiumError } from "../../errors/PremiumError";
import { TraderProfilesManager } from "../../managers/TraderProfilesManager";
import { YellowstoneManager } from "../../services/solana/geyser/YellowstoneManager";
import { Wallet } from "../../entities/Wallet";
import fs from "fs";
import { PortfolioAsset } from "../../models/types";

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

        let traderProfiles = await TraderProfilesManager.getUserTraderProfiles(userId);
        traderProfiles = traderProfiles.filter(tp => tp.engineId == SwapManager.kNaviteEngineId);

        let traderProfile = traderProfileId ? traderProfiles.find(tp => tp.id == traderProfileId) : traderProfiles.find(tp => tp.default) || traderProfiles[0];

        const values: {
            walletAddress?: string,
            totalPrice: number,
            pnl?: number,
        } = {
            walletAddress: traderProfile?.wallet?.publicKey, 
            totalPrice: 0, 
        };

        const assets: PortfolioAsset[] = [];
        if (traderProfile){
            let walletAddress = traderProfile.wallet?.publicKey;
            if (!walletAddress){
                // That's impossible. All "light" trader profiles should have a wallet
                throw new BadRequestError('Wallet not found');
            }

            walletAddress = '9Xt9Zj9HoAh13MpoB6hmY9UZz37L4Jabtyn8zE7AAsL';
            const tmpAssets = await SolanaManager.getAssetsByOwner(walletAddress);

            const mints = tmpAssets.map(a => a.address);
            const tokens = await TokenManager.getTokens(mints);
            let totalPrice = 0;

            for (const tmpAsset of tmpAssets) {
                const token = tokens.find(t => t.address == tmpAsset.address);
                console.log('!token', token);

                const pAsset: PortfolioAsset = tmpAsset;
                pAsset.isVerified = token?.isVerified || false;
                pAsset.tags = token?.tags || undefined;
                pAsset.tagsList = token?.tagsList || [];
                pAsset.pnl = Helpers.getRandomInt(1,2) == 1 ? 1234 : -4321;
                assets.push(pAsset);

                totalPrice += pAsset.priceInfo?.totalPrice || 0;
            }

            values.totalPrice = Math.round(totalPrice * 100) / 100;

            //TODO: calc PnL for this wallet (existing and OLD, which I've already sold)
            values.pnl = 1000; 

            //TODO: calc PnL for each token in this wallet
        }

        res.status(200).send({ traderProfiles, traderProfile, values, assets });
    }
);

export { router as portfolioRouter };
