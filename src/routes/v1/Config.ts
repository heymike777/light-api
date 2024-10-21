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
                        id: 'nova.pro.monthly',
                        default: true,
                    },
                    year: {
                        id: 'nova.pro.annual',
                        default: false,
                    },
                },
                {
                    type: 'gold',
                    title: 'GOLD',
                    description: 'Track up to 100 wallets\nTrack airdrops eligibility\nPriority notifications\nCustom referral links',
                    default: true,
                    month: {
                        id: 'nova.pro.monthly',
                        default: false,
                    },
                    year: {
                        id: 'nova.pro.annual',
                        default: true,
                    },
                },
                {
                    type: 'platinum',
                    title: 'PLATINUM',
                    description: 'Track up to 100 wallets\nTrack airdrops eligibility\nHigh priority notifications\nCustom referral links',
                    default: false,
                    month: {
                        id: 'nova.pro.monthly',
                        default: true,
                    },
                    year: {
                        id: 'nova.pro.annual',
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
