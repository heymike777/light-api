import express, { Request, Response } from "express";
import { body, header } from "express-validator";
import { validateRequest } from "../../../middlewares/ValidateRequest";
import { kServiceKey } from "../../../managers/MicroserviceManager";
import { BotManager } from "../../../managers/bot/BotManager";
import { SendMessageData } from "../../../managers/bot/BotTypes";
import { RabbitManager } from "../../../managers/RabbitManager";
import { LogManager } from "../../../managers/LogManager";

const router = express.Router();

router.post(
    '/api/v1/service/telegram/send-message',
    [
        header("serviceKey").equals(kServiceKey).withMessage('Service key is not valid'),
        body('messageData').exists().withMessage('Data is required'),
    ],
    validateRequest,
    async (req: Request, res: Response) => {
        const messageData = '' + req.body.messageData;
        console.log('Received service/telegram/send-message', 'messageData:', messageData);
        let success = false;

        try {
            const message: SendMessageData = JSON.parse(messageData);
            await RabbitManager.receivedMessage(message);
            // await BotManager.sendMessage(message);
            success = true;
        } catch (error) {
            LogManager.error('Error in service/telegram/send-message', error);
        }

        res.status(200).send({ success });
    }
);

export { router as telegramServiceRouter };
