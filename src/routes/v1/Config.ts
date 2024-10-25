import express, { Request, Response } from "express";
import { validateRequest } from "../../middlewares/ValidateRequest";
import { body } from "express-validator";
import { AuthManager } from "../../managers/AuthManager";
import { SubscriptionConfig } from "../../services/solana/types";

const router = express.Router();

router.get(
    '/api/v1/config',
    async (req: Request, res: Response) => {
		const platform = '' + req.query.platform;

        let subscriptions: SubscriptionConfig[] = [];
        if (platform == 'ios' || platform == 'android'){
            subscriptions = [
                {
                    type: 'free',
                    title: 'FREE',
                    description: 'Track up to 10 wallets',
                    default: false,
                },
                {
                    type: 'silver',
                    title: 'SILVER',
                    description: 'Track up to 100 wallets\nTrack airdrops eligibility',
                    default: false,
                    month: {
                        id: 'xyz.heynova.subscriptions.silver.month',
                        default: true,
                    },
                    year: {
                        id: 'xyz.heynova.subscriptions.silver.year',
                        default: false,
                    },
                },
                {
                    type: 'gold',
                    title: 'GOLD',
                    description: 'Track up to 100 wallets\nTrack airdrops eligibility\nPriority notifications\nCustom referral links',
                    default: true,
                    month: {
                        id: 'xyz.heynova.subscriptions.gold.month',
                        default: false,
                    },
                    year: {
                        id: 'xyz.heynova.subscriptions.gold.year',
                        default: true,
                    },
                },
                {
                    type: 'platinum',
                    title: 'PLATINUM',
                    description: 'Track up to 100 wallets\nTrack airdrops eligibility\nHigh priority notifications\nCustom referral links',
                    default: false,
                    month: {
                        id: 'xyz.heynova.subscriptions.platinum.month',
                        default: true,
                    },
                    year: {
                        id: 'xyz.heynova.subscriptions.platinum.year',
                        default: false,
                    },
                },
            ];
        }

        const config = {
            subscriptions,
        }

		const response = {
			config
		};
	
		res.status(200).send(response);
    }
);

export { router as configRouter };
