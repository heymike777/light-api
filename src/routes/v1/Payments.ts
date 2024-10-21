import express, { Request, Response } from "express";
import jwt from "express-jwt";
import { validateAuth } from "../../middlewares/ValidateAuth";
import { NotAuthorizedError } from "../../errors/NotAuthorizedError";
import { PaymentLog } from "../../entities/payments/PaymentLog";

const router = express.Router();

router.post(
    '/api/v1/payments/ios',
    jwt({ secret: process.env.JWT_SECRET_KEY!, algorithms: [process.env.JWT_ALGORITHM], credentialsRequired: true }),
    validateAuth(),  
    async (req: Request, res: Response) => {
        const userId = req.accessToken?.userId;
        if (!userId){
            throw new NotAuthorizedError();
        }

        const receipt = req.body.receipt;

        const log = await PaymentLog.create({
            userId,
            platform: 'ios',
            data: { receipt },
        });

        res.status(200).send({
            success: true,
        });
    }
);

export { router as paymentsRouter };
