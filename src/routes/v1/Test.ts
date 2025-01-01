import express, { Request, Response } from "express";
import { FirebaseManager } from "../../managers/FirebaseManager";
import { LogManager } from "../../managers/LogManager";

const router = express.Router();

router.post(
    '/api/v1/test/logs',
    async (req: Request, res: Response) => {
        const isLogsEnabled = req.body.isLogsEnabled;
        const isErrorsEnabled = req.body.isErrorsEnabled;

        LogManager.isLogsEnabled = isLogsEnabled;
        LogManager.isErrorsEnabled = isErrorsEnabled;

        res.status(200).send({ 
            isLogsEnabled: LogManager.isLogsEnabled,
            isErrorsEnabled: LogManager.isErrorsEnabled,
        });
    }
);

router.post(
    '/api/v1/test/:userId/push',
    async (req: Request, res: Response) => {
        const userId = req.params.userId;
        const title = req.body.title;
        const message = req.body.message;
        const data = req.body.data;

        const tmp = await FirebaseManager.sendPushToUser(userId, title, message, undefined, data);

        res.status(200).send({ success: true });
    }
);

export { router as testRouter };
