import express, { Request, Response } from "express";
import { body, header } from "express-validator";
import { validateRequest } from "../../../middlewares/ValidateRequest";
import { kServiceKey } from "../../../managers/MicroserviceManager";
import { Chain } from "../../../services/solana/types";
import { JupiterManager } from "../../../managers/JupiterManager";

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
        let success = false;

        // console.log('get-tokens-prices', chain, mints);

        const prices: {address: string, price: number}[] = [];
        try {
            if (mints.length > 0) {
                //TODO: check which prices I have in RAM
                if (chain == Chain.SOLANA){
                    const tmpPrices = await JupiterManager.getPrices(mints);
                    prices.push(...tmpPrices);
                }

            }            
            success = true;

        } catch (error) {
            console.error('Error in service/prices/tokensPrices', error);
        }

        console.log('get-tokens-prices', 'chain:', chain, 'success:', success, 'mints.length:', mints.length, 'prices:', prices, 'mints:', mints);

        res.status(200).send({ success, prices });
    }
);

export { router as pricesServiceRouter };
