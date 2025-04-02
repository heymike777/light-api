import express, { Request, Response } from "express";
import { body, header } from "express-validator";
import { validateRequest } from "../../../middlewares/ValidateRequest";
import { TxParser } from "../../../services/solana/geyser/TxParser";
import { WalletManager } from "../../../managers/WalletManager";
import { SwapManager } from "../../../managers/SwapManager";
import { kServiceKey } from "../../../managers/MicroserviceManager";
import { YellowstoneManager } from "../../../services/solana/geyser/YellowstoneManager";
import { Chain } from "../../../services/solana/types";

const router = express.Router();

router.post(
    '/api/v1/service/main/received-tx',
    [
        header('serviceKey').equals(kServiceKey).withMessage('Service key is not valid'),
        body('data').exists().withMessage('Data is required'),
        body('signature').exists().withMessage('Signature is required'),
        body('geyserId').exists().withMessage('Geyser ID is required'),
        body('chain').exists().withMessage('Chain is required'),
    ],
    validateRequest,
    async (req: Request, res: Response) => {
        const data = '' + req.body.data;
        const signature = '' + req.body.signature;
        const geyserId = '' + req.body.geyserId;
        const chain = req.body.chain ? req.body.chain as Chain : Chain.SOLANA;
        let success = false;

        // console.log('received-tx', signature, geyserId, chain);

        try {
            const jsonParsed = JSON.parse(data);
            
            const parsedTransactionWithMeta = await TxParser.parseGeyserTransactionWithMeta(jsonParsed);
            if (parsedTransactionWithMeta){
                WalletManager.processWalletTransaction(chain, parsedTransactionWithMeta, geyserId);
            }

            SwapManager.receivedConfirmationForSignature(chain, signature);
            success = true;
        } catch (error) {
            console.error('Error in received-tx', error);
        }

        res.status(200).send({ success });
    }
);

export { router as mainServiceRouter };
