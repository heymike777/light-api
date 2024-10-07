import express, { Request, Response } from "express";

const router = express.Router();

router.post(
    '/api/v1/subscriptions/apple/webhook/sandbox',
    async (req: Request, res: Response) => {
        console.log('Webhook received: subscriptions/apple/webhook/sandbox');
        console.log('body:', req.body);
        console.log('headers:', req.headers);
        console.log('query:', req.query);
        console.log('params:', req.params);

		res.status(200).send({});
    }
);

router.post(
    '/api/v1/subscriptions/apple/webhook',
    async (req: Request, res: Response) => {
        console.log('Webhook received: subscriptions/apple/webhook');
        console.log('body:', req.body);
        console.log('headers:', req.headers);
        console.log('query:', req.query);
        console.log('params:', req.params);

		res.status(200).send({});
    }
);

export { router as webhooksRouter };
