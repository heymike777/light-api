import express, { Request, Response } from "express";
import { validateRequest } from "../../middlewares/ValidateRequest";
import { body } from "express-validator";
import jwt from "express-jwt";
import { validateAuth } from "../../middlewares/ValidateAuth";
import { NotAuthorizedError } from "../../errors/NotAuthorizedError";
import { UserManager } from "../../managers/UserManager";
import { WalletManager } from "../../managers/WalletManager";
import { IWallet, Wallet } from "../../entities/Wallet";
import { BadRequestError } from "../../errors/BadRequestError";
import { PremiumError } from "../../errors/PremiumError";
import { Helpers } from "../../services/helpers/Helpers";

const router = express.Router();

router.get(
    '/api/v1/wallets',
    jwt({ secret: process.env.JWT_SECRET_KEY!, algorithms: [process.env.JWT_ALGORITHM], credentialsRequired: true }),
    validateAuth(true),
    async (req: Request, res: Response) => {
		const userId = req.accessToken?.userId;
        if (!userId) { throw new NotAuthorizedError(); }

        const user = await UserManager.getUserById(userId, true);
        if (!user) { throw new NotAuthorizedError(); }

        const wallets = await WalletManager.fetchWalletsByUserId(user.id);

		const response = {
            wallets: wallets
		};
	
		res.status(200).send(response);
    }
);

router.post(
    '/api/v1/wallets',
    [
        body('walletAddress').notEmpty().withMessage('Wallet address must be valid'),
        // body('title').optional().notEmpty().withMessage('Wallet title must be valid')
    ],
    validateRequest,
    jwt({ secret: process.env.JWT_SECRET_KEY!, algorithms: [process.env.JWT_ALGORITHM], credentialsRequired: true }),
    validateAuth(true),
    async (req: Request, res: Response) => {
		const userId = req.accessToken?.userId;
        if (!userId) { throw new NotAuthorizedError(); }

        const user = await UserManager.getUserById(userId, true);
        if (!user) { throw new NotAuthorizedError(); }

        const walletAddress = '' + req.body.walletAddress;
        const walletTitle = (req.body.title && req.body.title!=null && req.body.title!='') ? '' + req.body.title : undefined;
        const ipAddress = Helpers.getIpAddress(req);

        const wallet = await WalletManager.addWallet(-1, user, walletAddress, walletTitle, ipAddress);

        if (!wallet){
            throw new BadRequestError('Wallet could not be added');
        }

		const response = {
            success: true,
            wallet
		};
	
		res.status(200).send(response);
    }
);

router.delete(
    '/api/v1/wallets/:id',
    jwt({ secret: process.env.JWT_SECRET_KEY!, algorithms: [process.env.JWT_ALGORITHM], credentialsRequired: true }),
    validateAuth(true),
    async (req: Request, res: Response) => {
		const userId = req.accessToken?.userId;
        if (!userId) { throw new NotAuthorizedError(); }
        const ipAddress = Helpers.getIpAddress(req);

        const user = await UserManager.getUserById(userId, true);
        if (!user) { throw new NotAuthorizedError(); }

        const id = '' + req.params.id;
        const wallet = await Wallet.findById(id);
        if (!wallet || wallet.userId != userId){
            throw new BadRequestError('Wallet not found');
        }
        if (wallet.traderProfileId){
            throw new BadRequestError('Wallet is linked to a trader. Delete trader profile to delete this wallet.');
        }

        await WalletManager.removeWallet(wallet, ipAddress);

		const response = {
            success: true
		};
	
		res.status(200).send(response);
    }
);



export { router as walletsRouter };
