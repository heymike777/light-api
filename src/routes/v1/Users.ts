import express, { Request, Response } from "express";
import { BadRequestError } from "../../errors/BadRequestError";
import jwt from "express-jwt";
import { validateAuth } from "../../middlewares/ValidateAuth";
import { NotAuthorizedError } from "../../errors/NotAuthorizedError";
import { body } from "express-validator";
import { validateRequest } from "../../middlewares/ValidateRequest";
import { FirebaseManager } from "../../managers/FirebaseManager";

const router = express.Router();

router.post(
    '/api/v1/users/:userId/pushToken',
    [
        body("pushToken").notEmpty().withMessage("pushToken is required"),
        body("deviceId").notEmpty().withMessage("deviceId is required"),
    ],
    validateRequest,
    jwt({ secret: process.env.JWT_SECRET_KEY!, algorithms: [process.env.JWT_ALGORITHM], credentialsRequired: true }),
    validateAuth(),  
    async (req: Request, res: Response) => {
      const userId = req.accessToken?.userId;
      if (!userId){
        throw new NotAuthorizedError();
      }
   
      const pushToken = req.body.pushToken;
      const deviceId = req.body.deviceId;
      await FirebaseManager.savePushToken(userId, deviceId, pushToken);

      res.status(200).send({success: true});
    }
);

router.post(
    '/api/v1/users/:userId/logout',
    jwt({ secret: process.env.JWT_SECRET_KEY!, algorithms: [process.env.JWT_ALGORITHM], credentialsRequired: true }),
    validateAuth(),  
    async (req: Request, res: Response) => {
      const userId = req.accessToken?.userId;
      if (!userId){
        throw new NotAuthorizedError();
      }
   
      const deviceId = req.body.deviceId;
      if (deviceId){
        await FirebaseManager.deletePushTokens(userId, deviceId);
      }

      res.status(200).send({success: true});
    }
);

export { router as usersRouter };
