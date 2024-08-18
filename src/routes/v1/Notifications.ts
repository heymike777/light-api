import express, { Request, Response } from "express";
import { validateRequest } from "../../middlewares/ValidateRequest";
import { body } from "express-validator";
import { BotManager } from "../../services/BotManager";

const router = express.Router();

router.post(
    '/api/v1/messages/system',
    [
        body('message').notEmpty().withMessage('Message is required'),
    ],
    validateRequest,
    async (req: Request, res: Response) => {
        const message = req.body.message;
        const chatId = req.body.chatId || +process.env.TELEGRAM_SYSTEM_CHAT_ID!;

        await BotManager.sendSystemMessage(message, chatId);

        const response = {
        };
      
        res.status(200).send(response);
    }
);

export { router as messagesRouter };
