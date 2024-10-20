import express, { Request, Response } from "express";
import { AppStoreManager } from "../../managers/AppStoreManager";

const router = express.Router();

router.post(
    '/api/v1/subscriptions/apple/webhook/:environment',
    async (req: Request, res: Response) => {
        const { environment } = req.params;
        console.log('Webhook received: subscriptions/apple/webhook');
        console.log('environment:', environment);
        console.log('body:', req.body);
        console.log('headers:', req.headers);
        console.log('query:', req.query);
        console.log('params:', req.params);

        const isSandbox = environment === 'sandbox';
        const body = req.body;
        const success = await AppStoreManager.receivedPaymentWebhook(body, isSandbox);
        console.log('!success:', success);
		res.status(200).send({
            success,
        });
    }
);

export { router as webhooksRouter };
