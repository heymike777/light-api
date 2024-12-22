import express, { Request, Response } from "express";
import { validateRequest } from "../../middlewares/ValidateRequest";
import { body } from "express-validator";
import { AuthManager } from "../../managers/AuthManager";
import { Engine, SubscriptionConfig } from "../../services/solana/types";
import { SubscriptionManager } from "../../managers/SubscriptionManager";
import { SubscriptionTier } from "../../entities/payments/Subscription";

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
                    maxNumberOfWallets: SubscriptionManager.getMaxNumberOfWallets(),
                    maxNumberOfTradingProfiles: SubscriptionManager.getMaxNumberOfTradingProfiles(),
                },
                {
                    type: SubscriptionTier.SILVER,
                    title: 'SILVER',
                    maxNumberOfWallets: SubscriptionManager.getMaxNumberOfWallets(SubscriptionTier.SILVER),
                    maxNumberOfTradingProfiles: SubscriptionManager.getMaxNumberOfTradingProfiles(SubscriptionTier.SILVER),
                },
                {
                    type: SubscriptionTier.GOLD,
                    title: 'GOLD',
                    maxNumberOfWallets: SubscriptionManager.getMaxNumberOfWallets(SubscriptionTier.GOLD),
                    maxNumberOfTradingProfiles: SubscriptionManager.getMaxNumberOfTradingProfiles(SubscriptionTier.GOLD),
                },
                {
                    type: SubscriptionTier.PLATINUM,
                    title: 'PLATINUM',
                    maxNumberOfWallets: SubscriptionManager.getMaxNumberOfWallets(SubscriptionTier.PLATINUM),
                    maxNumberOfTradingProfiles: SubscriptionManager.getMaxNumberOfTradingProfiles(SubscriptionTier.PLATINUM),
                },
            ];
        }

        //TODO: add urls
        const engines: Engine[] = [
            // {
            //     id: 'light',
            //     title: 'Light',
            //     logo: 'https://light.dangervalley.com/static/light.png',
            //     isSubscriptionRequired: false,
            //     isExternal: false,
            // },
            {
                id: 'bonkbot',
                title: 'BonkBot',
                logo: 'https://light.dangervalley.com/static/bonkbot.png',
                isSubscriptionRequired: true,
                isExternal: true,
                url: 'https://t.me/bonkbot_bot?start=ref_ceqh3',
                tokenUrl: 'https://t.me/bonkbot_bot?start=ref_ceqh3_ca_{token}',
            },
            {
                id: 'maestro_base',
                title: 'Maestro',
                logo: 'https://light.dangervalley.com/static/maestro.png',
                isSubscriptionRequired: true,
                isExternal: true,
                url: 'https://t.me/maestro?start=r-heymike777',
                tokenUrl: 'https://t.me/maestro?start={token}-heymike777',
            },
            {
                id: 'maestro_pro',
                title: 'Maestro',
                logo: 'https://light.dangervalley.com/static/maestro.png',
                isSubscriptionRequired: true,
                isExternal: true,
                url: 'https://t.me/maestropro?start=r-heymike777',
                tokenUrl: 'https://t.me/maestropro?start={token}-heymike777',
            },
            // {
            //     id: 'trojan',
            //     title: 'Trojan',
            //     logo: 'https://light.dangervalley.com/static/trojan.png',
            //     isSubscriptionRequired: true,
            //     isExternal: true,
            //     url: '',
            //     tokenUrl: '',
            // },
            // {
            //     id: 'bananagun',
            //     title: 'BananaGun',
            //     logo: 'https://light.dangervalley.com/static/bananagun.png',
            //     isSubscriptionRequired: true,
            //     isExternal: true,
            //     url: '',
            //     tokenUrl: '',
            // },
        ];

        const farm: {
            types: {id: string, title: string}[],
            modes: {id: string, title: string}[],
            amounts: {id: string, title: string}[],
            dexes: {id: string, title: string, logo: string}[],
        } = {
            types: [
                {id: 'pump_one_token', title: 'Pump one token'},
                {id: 'farm_dex_volume', title: 'Farm volume on DEX'},
            ],
            modes: [
                {id: 'fast', title: 'Fast (up to 6 hours)'},
                {id: 'normal', title: 'Normal (up to 24 hours)'},
                {id: 'steady', title: 'Stready (up to 7 days)'},
            ],
            amounts: [
                {id: 'light_pump', title: 'Light pump (3 SOL)'},
                {id: 'boost', title: 'Boost (9 SOL)'},
                {id: 'growth', title: 'Growth (18 SOL)'},
                {id: 'dominance', title: 'Dominance (30 SOL)'},
                {id: 'meme_master', title: 'Meme master (60 SOL)'},
            ],
            dexes: [
                {
                    id: 'pumpfun',
                    title: 'PumpFun',
                    logo: 'https://light.dangervalley.com/static/pumpfun.png',
                },
                {
                    id: 'raydium',
                    title: 'Raydium',
                    logo: 'https://light.dangervalley.com/static/raydium.png',
                },
            ]
        }

        const config = {
            subscriptions,
            engines,
            farm,
        }

		const response = {
			config
		};
	
		res.status(200).send(response);
    }
);

export { router as configRouter };
