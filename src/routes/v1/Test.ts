import express, { Request, Response } from "express";
import { FirebaseManager } from "../../managers/FirebaseManager";
import { LogManager } from "../../managers/LogManager";
import { TokenManager } from "../../managers/TokenManager";
import { Chain } from "../../services/solana/types";

const router = express.Router();

router.post(
    '/api/v1/test/logs',
    async (req: Request, res: Response) => {
        const times: {time: number, message: string, took: number}[] = [];
        times.push({time: Date.now(), message: "start", took: 0});

        const isLogsEnabled = req.body.isLogsEnabled;
        const isErrorsEnabled = req.body.isErrorsEnabled;

        LogManager.isLogsEnabled = isLogsEnabled;
        LogManager.isErrorsEnabled = isErrorsEnabled;

        times.push({time: Date.now(), message: "done", took: Date.now()-times[times.length-1].time});

        res.status(200).send({ 
            isLogsEnabled: LogManager.isLogsEnabled,
            isErrorsEnabled: LogManager.isErrorsEnabled,
            times: times,
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

router.get(
    '/api/v1/test/token/:mint',
    async (req: Request, res: Response) => {
        const mint = req.params.mint;

        const token = await TokenManager.getToken(Chain.SOLANA, mint);
        res.status(200).send({ token });
    }
);

export { router as testRouter };
