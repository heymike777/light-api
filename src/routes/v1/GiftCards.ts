import express, { Request, Response } from "express";
import { validateRequest } from "../../middlewares/ValidateRequest";
import { body } from "express-validator";
import jwt from "express-jwt";
import { validateAuth } from "../../middlewares/ValidateAuth";
import { NotAuthorizedError } from "../../errors/NotAuthorizedError";
import { UserManager } from "../../managers/UserManager";
import { BadRequestError } from "../../errors/BadRequestError";
import { Helpers } from "../../services/helpers/Helpers";
import { PermissionError } from "../../errors/PermissionError";
import { SubscriptionPlatform, SubscriptionTier } from "../../entities/payments/Subscription";
import { GiftCard } from "../../entities/giftCards/GiftCard";
import { GiftCardClaim } from "../../entities/giftCards/GiftCardClaim";
import { MixpanelManager } from "../../managers/MixpanelManager";
import { SubscriptionManager } from "../../managers/SubscriptionManager";
import { UserRefClaim } from "../../entities/referrals/UserRefClaim";
import { GiftCardsManager } from "../../managers/GiftCardsManager";
import { ReferralsManager } from "../../managers/ReferralsManager";

const router = express.Router();

router.post(
    '/api/v1/giftCards',
    [
        body('code').notEmpty().withMessage('Code must be valid'),
        body('entries').isNumeric().withMessage('Entries must be valid'),
        body('startAt').isISO8601().toDate().withMessage('Start At must be valid'),
        body('endAt').isISO8601().toDate().withMessage('End At must be valid'),

        body('subscription.tier').isIn([SubscriptionTier.SILVER, SubscriptionTier.GOLD, SubscriptionTier.PLATINUM]).withMessage('Tier must be valid'),
        body('subscription.days').isInt().withMessage('Days must be valid'),
    ],
    validateRequest,
    jwt({ secret: process.env.JWT_SECRET_KEY!, algorithms: [process.env.JWT_ALGORITHM], credentialsRequired: true }),
    validateAuth(true),
    async (req: Request, res: Response) => {
		const userId = req.accessToken?.userId;
        if (!userId) { throw new NotAuthorizedError(); }

        const user = await UserManager.getUserById(userId, true);
        if (!user) { throw new NotAuthorizedError(); }
        if (!user.isAdmin) { throw new PermissionError(); }
        
        const code = ('' + req.body.code).toLowerCase();
        const referralCode = req.body.referralCode ? ('' + req.body.referralCode) : undefined;
        const entries = parseInt('' + req.body.entries);
        const startAt = new Date(req.body.startAt);
        const endAt = new Date(req.body.endAt);
        const subscription = {
            tier: req.body.subscription.tier as SubscriptionTier,
            days: parseInt('' + req.body.subscription.days),
        };

        const existing = await GiftCard.findOne({ code });
        if (existing){
            throw new BadRequestError('Gift card already exists');
        }

        const giftCard = new GiftCard();
        giftCard.code = code;
        giftCard.entries = entries;
        giftCard.startAt = startAt;
        giftCard.endAt = endAt;
        giftCard.referralCode = referralCode;
        giftCard.subscription = {
            tier: subscription.tier,
            days: subscription.days
        };
        await giftCard.save();

		res.status(200).send(giftCard);
    }
);

router.post(
    '/api/v1/giftCards/claim',
    [
        body('code').notEmpty().withMessage('Code must be valid'),
    ],
    validateRequest,
    jwt({ secret: process.env.JWT_SECRET_KEY!, algorithms: [process.env.JWT_ALGORITHM], credentialsRequired: true }),
    validateAuth(true),
    async (req: Request, res: Response) => {
		const userId = req.accessToken?.userId;
        if (!userId) { throw new NotAuthorizedError(); }

        const user = await UserManager.getUserById(userId, true);
        if (!user) { throw new NotAuthorizedError(); }
        
        await UserManager.fillUserWithData(user);
        if (user.subscription){
            throw new BadRequestError(`You can't claim gift card with active subscription`);
        }

        const code = ('' + req.body.code).toLowerCase();
        const ipAddress = Helpers.getIpAddress(req);

        const giftCard = await GiftCard.findOne({ code });
        if (!giftCard){
            throw new BadRequestError('Gift card not found');
        }

        const now = new Date();
        if (now < giftCard.startAt || now > giftCard.endAt){
            throw new BadRequestError('Gift card is not valid');
        }

        const existingClaim = await GiftCardClaim.findOne({ cardId: giftCard.id, userId });
        if (existingClaim){
            throw new BadRequestError('You already claimed this gift card');
        }

        const claimsCount = await GiftCardClaim.countDocuments({ cardId: giftCard.id });
        if (claimsCount >= giftCard.entries){
            throw new BadRequestError('All entries have been claimed. Try another one.');
        }

        const tier = giftCard.subscription?.tier;
        const days = giftCard.subscription?.days;

        if (!tier || !days){
            throw new BadRequestError('Gift card is not valid');
        }

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + days);

        const claim = new GiftCardClaim();
        claim.cardId = giftCard.id;
        claim.userId = userId;
        claim.startAt = now;
        claim.endAt = expiresAt;
        await claim.save();

        // create subscription
        await SubscriptionManager.createSubscription(userId, tier, SubscriptionPlatform.GIFT_CARD, expiresAt, now);

        if (giftCard.referralCode){
            await ReferralsManager.claimRefCode(user, giftCard.referralCode, false);
        }

        user.usedGiftCardsCount = (user.usedGiftCardsCount || 0) + 1;
        await user.save();

        MixpanelManager.track('GiftCardClaim', userId, { code, tier, days }, ipAddress);

        await SubscriptionManager.updateUserSubscriptionStatus(userId);
        GiftCardsManager.sendSystemNotification(user, code);

		const response = {
            success: true,
            message: `You've reveived ${tier} subscription for ${days} days`,
		};
	
		res.status(200).send(response);
    }
);

router.get(
    '/api/v1/giftCards/claimed',
    jwt({ secret: process.env.JWT_SECRET_KEY!, algorithms: [process.env.JWT_ALGORITHM], credentialsRequired: true }),
    validateAuth(true),
    async (req: Request, res: Response) => {
		const userId = req.accessToken?.userId;
        if (!userId) { throw new NotAuthorizedError(); }

        const claims = await GiftCardClaim.find({ userId }).sort({ createdAt: -1 });
        const cards = await GiftCard.find({ _id: { $in: claims.map(c => c.cardId) } });

        const claimedCards = claims.map(claim => {
            const card = cards.find(c => c.id == claim.cardId);
            return {
                code: card?.code,
                tier: card?.subscription?.tier,
                from: claim.startAt,
                to: claim.endAt,
            };
        });

		res.status(200).send({ claimedCards });
    }
);


export { router as giftCardsRouter };
