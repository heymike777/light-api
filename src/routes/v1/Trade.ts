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

        if (!traderProfile.wallet){
            throw new BadRequestError('Trader profile wallet not found');
        }

        if (amount <= 0.0001){
            throw new BadRequestError('Amount should be greater than 0');
        }

        const connection = newConnection();
        const balance = await SolanaManager.getWalletSolBalance(connection, traderProfile.wallet.publicKey);
        const minSolRequired = amount * 1.01 + 0.01;
        if (!balance || balance.uiAmount < minSolRequired){
            throw new BadRequestError('Insufficient balance');
        }

        const amountInLamports = new BN(amount).mul(new BN(10).pow(new BN(9)));

        const swap = new Swap();
        swap.type = SwapType.BUY;
        swap.dex = SwapDex.JUPITER;
        swap.userId = userId;
        swap.traderProfileId = traderProfileId;
        swap.amountIn = amountInLamports.toString();
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

        const traderProfile = await TraderProfilesManager.findById(traderProfileId);
        if (!traderProfile){
            throw new BadRequestError('Trader profile not found');
        }

        if (traderProfile.engineId !== SwapManager.kNaviteEngineId){
            throw new BadRequestError('Only Light engine is supported');
        }

        if (!traderProfile.wallet){
            throw new BadRequestError('Trader profile wallet not found');
        }

        if (mint == kSolAddress){
            throw new BadRequestError('Selling SOL is not supported');
        }

        if (amount <= 0.0001){
            throw new BadRequestError('Amount should be greater than 0');
        }

        const connection = newConnection();
        const balance = await SolanaManager.getWalletTokenBalance(connection, traderProfile.wallet.publicKey, mint);
        if (!balance){
            throw new BadRequestError('Insufficient balance');
        }

        const decimals = balance.decimals || 0;
        const amountInLamports = new BN(amount).mul(new BN(10).pow(new BN(decimals)));
        const balanceAmount = new BN(balance.amount || 0);

        if (balanceAmount < amountInLamports){
            throw new BadRequestError('Insufficient balance');
        }

        const swap = new Swap();
        swap.type = SwapType.SELL;
        swap.dex = SwapDex.JUPITER;
        swap.userId = userId;
        swap.traderProfileId = traderProfileId;
        swap.amountIn = amountInLamports.toString();
        swap.mint = mint;
        swap.createdAt = new Date();
        swap.status = {
            type: StatusType.CREATED,
            tryIndex: 0,
        };
        await swap.save();

        const signature = await SwapManager.sell(swap, traderProfile);

        res.status(200).send({ success: signature ? true : false, signature });
    }
);


export { router as tradeRouter };
