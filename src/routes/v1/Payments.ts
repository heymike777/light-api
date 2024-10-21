import express, { Request, Response } from "express";
import jwt from "express-jwt";
import { validateAuth } from "../../middlewares/ValidateAuth";
import { NotAuthorizedError } from "../../errors/NotAuthorizedError";
import { PaymentLog } from "../../entities/payments/PaymentLog";
import { BadRequestError } from "../../errors/BadRequestError";
import { validateRequest } from "../../middlewares/ValidateRequest";
import { body, param } from "express-validator";

const router = express.Router();

router.post(
    '/api/v1/payments/:platform',
    [
        body('receipt').notEmpty().withMessage('Receipt is required'),
        param('platform').isIn(['ios', 'android']).withMessage('Platform is not valid'),
    ],
    validateRequest,
    jwt({ secret: process.env.JWT_SECRET_KEY!, algorithms: [process.env.JWT_ALGORITHM], credentialsRequired: true }),
    validateAuth(),  
    async (req: Request, res: Response) => {
        const userId = req.accessToken?.userId;
        if (!userId){
            throw new NotAuthorizedError();
        }

        const platform = req.params.platform;
        const receipt = req.body.receipt;

        if (!receipt){
            throw new BadRequestError('receipt is required', 'receipt');
        }


        //TODO: validate receipt and save payment

        const log = await PaymentLog.create({
            userId,
            platform,
            data: { receipt },
        });

        res.status(200).send({
            success: true,
        });
    }
);

export { router as paymentsRouter };
