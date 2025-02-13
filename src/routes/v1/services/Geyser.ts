import express, { Request, Response } from "express";
import { header } from "express-validator";
import { validateRequest } from "../../../middlewares/ValidateRequest";
import { kServiceKey } from "../../../managers/MicroserviceManager";
import { YellowstoneManager } from "../../../services/solana/geyser/YellowstoneManager";
import { EnvManager } from "../../../managers/EnvManager";

const router = express.Router();

router.post(
    '/api/v1/service/geyser/resubscribe',
    [
        header("serviceKey").equals(kServiceKey).withMessage('Service key is not valid'),
    ],
    validateRequest,
    async (req: Request, res: Response) => {    
        if (EnvManager.isGeyserProcess){
            YellowstoneManager.resubscribeAll();
        }
        res.status(200).send({ success: EnvManager.isGeyserProcess });
    }
);

export { router as geyserServiceRouter };
