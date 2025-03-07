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

            walletAddress = '9Xt9Zj9HoAh13MpoB6hmY9UZz37L4Jabtyn8zE7AAsL';//TODO: remove test wallet
            const tmpAssets = await SolanaManager.getAssetsByOwner(walletAddress);

            const mints = tmpAssets.map(a => a.address);
            const tokens = await TokenManager.getTokens(mints);
            let totalPrice = 0;

            for (const tmpAsset of tmpAssets) {
                const token = tokens.find(t => t.address == tmpAsset.address);
                console.log('!token', token);

                const pAsset: PortfolioAsset = tmpAsset;
                pAsset.isVerified = token?.isVerified || false;
                pAsset.isTradable = TokenManager.isTokenTradable(token?.address);
                pAsset.tags = token?.tags || undefined;
                pAsset.tagsList = token?.tagsList || [];

                const rand = Helpers.getRandomInt(1, 3);
                pAsset.pnl = rand == 1 ? 1234 : (rand == 2 ? -1234 : undefined);
                assets.push(pAsset);

                totalPrice += pAsset.priceInfo?.totalPrice || 0;
            }

            values.totalPrice = Math.round(totalPrice * 100) / 100;

            //TODO: calc PnL for this wallet (existing and OLD, which I've already sold)
            values.pnl = 1000; 

            //TODO: calc PnL for each token in this wallet
        }

        let warning: {
            message: string,
            backgroundColor: string,
            textColor: string,
        } | undefined = undefined;

        const solAsset = assets.find(a => a.address == kSolAddress && a.symbol == 'SOL');

        if (!solAsset || solAsset.uiAmount < 0.01){
            warning = {
                message: 'Send some SOL to your trading wallet to ape into memes and cover gas fee.',
                backgroundColor: '#DC3545',
                textColor: '#FFFFFF',
            }
        }

        for (const asset of assets) {
            asset.amount = asset.uiAmount;
            asset.uiAmount = 0;
        }

        res.status(200).send({ warning, traderProfiles, traderProfile, values, assets });
    }
);

export { router as portfolioRouter };
