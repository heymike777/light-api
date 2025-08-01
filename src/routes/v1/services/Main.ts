import express, { Request, Response } from "express";
import { body, header } from "express-validator";
import { validateRequest } from "../../../middlewares/ValidateRequest";
import { TxParser } from "../../../services/solana/geyser/TxParser";
import { WalletManager } from "../../../managers/WalletManager";
import { SwapManager } from "../../../managers/SwapManager";
import { kServiceKey } from "../../../managers/microservices/MicroserviceManager";
import { Chain } from "../../../services/solana/types";
import { LogManager } from "../../../managers/LogManager";
import { ChaosManager } from "../../../services/solana/svm/ChaosManager";

const router = express.Router();

//TODO: remove this route. it not used anymore
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

            SwapManager.receivedConfirmationForSignature(chain, signature, parsedTransactionWithMeta);
            ChaosManager.receivedConfirmationForSignature(chain, signature);
            success = true;
        } catch (error) {
            LogManager.error('Error in received-tx', error);
        }

        res.status(200).send({ success });
    }
);

export { router as mainServiceRouter };
