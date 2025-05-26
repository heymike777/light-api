import express, { Request, Response } from "express";
import { body, header } from "express-validator";
import { validateRequest } from "../../middlewares/ValidateRequest";
import { kServiceKey } from "../../managers/MicroserviceManager";
import { AirdropManager } from "../../managers/airdrops/AirdropManager";

const router = express.Router();

router.post(
    '/api/v1/admin/airdrop',
    [
        header("serviceKey").equals(kServiceKey).withMessage('Service key is not valid'),
        body("airdropId").notEmpty().withMessage('Airdrop ID is required'),
    ],
    validateRequest,
    async (req: Request, res: Response) => {    
        const airdropId = req.body.airdropId;
        const usersIds: string[] | undefined = req.body.usersIds || undefined;

        if (!usersIds){
            //TODO: all users
            // await AirdropManager.checkAllUsersForAirdrop
        }
        
        res.status(200).send({ airdropId, usersIds });
    }
);

export { router as adminRouter };
