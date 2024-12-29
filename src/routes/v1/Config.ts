import express, { Request, Response } from "express";
import { SubscriptionConfig } from "../../services/solana/types";
import { SubscriptionManager } from "../../managers/SubscriptionManager";
import { SubscriptionTier } from "../../entities/payments/Subscription";
import { TraderManager } from "../../managers/TraderManager";
import { AppPlatform } from "../../models/types";
import { Helpers } from "../../services/helpers/Helpers";

const router = express.Router();

router.get(
    '/api/v1/config',
    async (req: Request, res: Response) => {
		const platform = '' + req.query.platform;

        const appHeaders = Helpers.getAppHeaders(req);
        console.log('appHeaders:', appHeaders);

        let subscriptions: SubscriptionConfig[] = [];
        if (platform == AppPlatform.IOS || platform == AppPlatform.ANDROID){
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
            engines: TraderManager.engines,
            farm,
        }

		const response = {
			config
		};
	
		res.status(200).send(response);
    }
);

export { router as configRouter };
