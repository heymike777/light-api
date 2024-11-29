import express, { Request, Response } from "express";
import fs from 'fs';
import { BadRequestError } from "../../errors/BadRequestError";

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
        console.log(`RevenueCat webhook received: webhooks/revenuecat/${environment}`, req.body);

        if (req.headers['authorization'] !== process.env.REVENUE_CAT_AUTH_HEADER){
            throw new BadRequestError('Unauthorized');
        }

		res.status(200).send({
            success: true,
        });
    }
);

export { router as webhooksRouter };
