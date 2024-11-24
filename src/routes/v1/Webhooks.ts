import express, { Request, Response } from "express";
import { AppStoreManager } from "../../managers/AppStoreManager";
import fs from 'fs';

const router = express.Router();

router.post(
    '/api/v1/subscriptions/apple/webhook/:environment',
    async (req: Request, res: Response) => {
        const { environment } = req.params;
        console.log(`Webhook received: subscriptions/apple/webhook/${environment}`);

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

export { router as webhooksRouter };
