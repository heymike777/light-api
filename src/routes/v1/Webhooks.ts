import express, { Request, Response } from "express";
import fs from 'fs';
import { BadRequestError } from "../../errors/BadRequestError";
import { SubscriptionManager } from "../../managers/SubscriptionManager";

const router = express.Router();

router.post(
    '/api/v1/webhooks/apple/:environment',
    async (req: Request, res: Response) => {
        const { environment } = req.params;
        console.log(`Apple webhook received: webhooks/apple/${environment}`, req.body);

        fs.appendFileSync('apple_webhooks.txt', 'environment:' + environment + '\n' + JSON.stringify(req.body, null, 2) + '\n\n');

		res.status(200).send({});
    }
);

router.post(
    '/api/v1/webhooks/revenuecat/:environment',
    async (req: Request, res: Response) => {
        const { environment } = req.params;
        if (req.headers['authorization'] !== process.env.REVENUE_CAT_AUTH_HEADER){
            console.log('Unauthorized', req.headers['authorization']);
            throw new BadRequestError('Unauthorized');
        }
        console.log(`RevenueCat webhook received: webhooks/revenuecat/${environment}`, req.body);

        const event = req.body.event;
        const userId = event?.app_user_id;
        const originalUserId = event?.original_app_user_id;

        if (userId){
            await SubscriptionManager.updateUserSubscription(userId);
        }
        
        if (originalUserId && originalUserId !== userId){
            await SubscriptionManager.updateUserSubscription(originalUserId);
        }

		res.status(200).send({
            success: true,
        });
    }
);

export { router as webhooksRouter };
