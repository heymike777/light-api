import express, { Request, Response } from "express";
import { body, header } from "express-validator";
import { validateRequest } from "../../../middlewares/ValidateRequest";
import { TxParser } from "../../../services/solana/geyser/TxParser";
import { WalletManager } from "../../../managers/WalletManager";
import { SwapManager } from "../../../managers/SwapManager";
import { kServiceKey } from "../../../managers/MicroserviceManager";
import { YellowstoneManager } from "../../../services/solana/geyser/YellowstoneManager";

const router = express.Router();

router.post(
    '/api/v1/service/main/received-tx',
    [
        header("serviceKey").equals(kServiceKey).withMessage('Service key is not valid'),
        body('data').exists().withMessage('Data is required'),
        body('signature').exists().withMessage('Signature is required'),
        body('geyserId').exists().withMessage('Geyser ID is required'),
    ],
    validateRequest,
    async (req: Request, res: Response) => {
        const data = '' + req.body.data;
        const signature = '' + req.body.signature;
        const geyserId = '' + req.body.geyserId;
        let success = false;

        try {
            console.log('received-tx', 'signature:', signature, 'data:', data);

            const geyserData = YellowstoneManager.jsonToGeyserTx(data);
            
            const parsedTransactionWithMeta = await TxParser.parseGeyserTransactionWithMeta(geyserData);
            if (parsedTransactionWithMeta){
                WalletManager.processWalletTransaction(parsedTransactionWithMeta, geyserId);
            }

            SwapManager.receivedConfirmationForSignature(signature);
            success = true;
        } catch (error) {
            console.error('Error in received-tx', error);
        }

        res.status(200).send({ success });
    }
);

export { router as mainServiceRouter };
