import express, { Request, Response } from "express";
import { SubscriptionConfig } from "../../services/solana/types";
import { SubscriptionManager } from "../../managers/SubscriptionManager";
import { SubscriptionTier } from "../../entities/payments/Subscription";
import { SwapManager } from "../../managers/SwapManager";
import { AppPlatform } from "../../models/types";
import { Helpers } from "../../services/helpers/Helpers";
import { LogManager } from "../../managers/LogManager";

const router = express.Router();

const iosProductionVersions: string[] = ['1.0'];
const androidProductionVersions: string[] = [];

router.get(
    '/api/v1/config',
    async (req: Request, res: Response) => {
		const platform = '' + req.query.platform;

        const appHeaders = Helpers.getAppHeaders(req);
        LogManager.log('appHeaders:', appHeaders, 'allHeaders:', req.headers);

        let subscriptions: SubscriptionConfig[] = [];
        if (platform == AppPlatform.IOS || platform == AppPlatform.ANDROID){
            subscriptions = [
                {
                    type: 'free',
                    title: 'FREE',
                    maxNumberOfWallets: SubscriptionManager.getMaxNumberOfWallets(),
                    maxNumberOfTraderProfiles: SubscriptionManager.getMaxNumberOfTraderProfiles(),
                },
                {
                    type: SubscriptionTier.SILVER,
                    title: 'SILVER',
                    maxNumberOfWallets: SubscriptionManager.getMaxNumberOfWallets(SubscriptionTier.SILVER),
                    maxNumberOfTraderProfiles: SubscriptionManager.getMaxNumberOfTraderProfiles(SubscriptionTier.SILVER),
                },
                {
                    type: SubscriptionTier.GOLD,
                    title: 'GOLD',
                    maxNumberOfWallets: SubscriptionManager.getMaxNumberOfWallets(SubscriptionTier.GOLD),
                    maxNumberOfTraderProfiles: SubscriptionManager.getMaxNumberOfTraderProfiles(SubscriptionTier.GOLD),
                },
                {
                    type: SubscriptionTier.PLATINUM,
                    title: 'PLATINUM',
                    maxNumberOfWallets: SubscriptionManager.getMaxNumberOfWallets(SubscriptionTier.PLATINUM),
                    maxNumberOfTraderProfiles: SubscriptionManager.getMaxNumberOfTraderProfiles(SubscriptionTier.PLATINUM),
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
        };

        let engines = SwapManager.engines;

        if (appHeaders && appHeaders.appVersion == '1.0'){
            engines = engines.filter(e => e.isExternal);
        }

        const giftCardsAvailable = iosProductionVersions.includes(appHeaders.appVersion) || androidProductionVersions.includes(appHeaders.appVersion);

        const config = {
            subscriptions,
            engines,
            farm,
            giftCardsAvailable,
        };

		const response = {
			config
		};
	
		res.status(200).send(response);
    }
);

export { router as configRouter };
