import express, { Request, Response } from "express";

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

		res.status(200).send({});
    }
);

export { router as webhooksRouter };
