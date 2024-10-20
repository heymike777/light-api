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

        let subscruptions: SubscriptionConfig[] = [];
        if (platform == 'ios' || platform == 'android'){
            subscruptions = [
                {
                    type: 'silver',
                    title: 'SILVER',
                    description: 'Track up to 100 wallets\nTrack airdrops eligibility',
                    month: {
                        id: 'nova.pro.monthly',
                    },
                    year: {
                        id: 'nova.pro.annual',
                    },
                },
                {
                    type: 'gold',
                    title: 'GOLD',
                    description: 'Track up to 100 wallets\nTrack airdrops eligibility\nPriority notifications\nCustom referral links',
                    month: {
                        id: 'nova.pro.monthly',
                    },
                    year: {
                        id: 'nova.pro.annual',
                    },
                },
                {
                    type: 'platinum',
                    title: 'PLATINUM',
                    description: 'Track up to 100 wallets\nTrack airdrops eligibility\nHigh priority notifications\nCustom referral links',
                    month: {
                        id: 'nova.pro.monthly',
                    },
                    year: {
                        id: 'nova.pro.annual',
                    },
                },
            ];
        }

        const config = {
            subscruptions,
        }

		const response = {
			config
		};
	
		res.status(200).send(response);
    }
);

export { router as configRouter };
