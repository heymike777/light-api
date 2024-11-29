import express, { Request, Response } from "express";
import { AppStoreManager } from "../../managers/AppStoreManager";
import fs from 'fs';

const router = express.Router();

router.post(
    '/api/v1/webhooks/apple/:environment',
    async (req: Request, res: Response) => {
        const { environment } = req.params;
        console.log(`Apple webhook received: webhooks/apple/${environment}`, req.body);

        fs.appendFileSync('apple_webhooks.txt', 'environment:' + environment + '\n' + JSON.stringify(req.body, null, 2) + '\n\n');

        const isSandbox = environment === 'sandbox';
        const body = req.body;
        const success = await AppStoreManager.receivedPaymentWebhook(body);
        console.log('!success:', success);
		res.status(200).send({
            success,
        });
    }
);

router.post(
    '/api/v1/webhooks/revenuecat/:environment',
    async (req: Request, res: Response) => {
        const { environment } = req.params;
        console.log(`RevenueCat webhook received: webhooks/revenuecat/${environment}`, req.body);

		res.status(200).send({
            success: true,
        });
    }
);

export { router as webhooksRouter };
