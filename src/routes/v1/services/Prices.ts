import express, { Request, Response } from "express";
import { body, header } from "express-validator";
import { validateRequest } from "../../../middlewares/ValidateRequest";
import { kServiceKey } from "../../../managers/microservices/MicroserviceManager";
import { Chain } from "../../../services/solana/types";
import { JupiterManager } from "../../../managers/JupiterManager";
import { kSolAddress } from "../../../services/solana/Constants";
import { TokenPriceManager } from "../../../managers/TokenPriceManager";

const router = express.Router();

router.post(
    '/api/v1/service/prices/tokensPrices',
    [
        header("serviceKey").equals(kServiceKey).withMessage('Service key is not valid'),
        body('mints').exists().withMessage('mints are required'),
    ],
    validateRequest,
    async (req: Request, res: Response) => {
        const chain = req.body.chain ? req.body.chain as Chain : Chain.SOLANA;
        const mints: string[] = req.body.mints;
        const prices = await TokenPriceManager.getTokensPrices(chain, mints);

        // console.log('get-tokens-prices', 'chain:', chain, 'mints.length:', mints.length, 'prices:', prices, 'mints:', mints);

        res.status(200).send({ success: true, prices });
    }
);

export { router as pricesServiceRouter };
