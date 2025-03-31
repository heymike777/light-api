import express, { Request, Response } from "express";
import jwt from "express-jwt";
import { validateAuth } from "../../middlewares/ValidateAuth";
import { NotAuthorizedError } from "../../errors/NotAuthorizedError";
import { validateRequest } from "../../middlewares/ValidateRequest";
import { body } from "express-validator";
import { SearchManager } from "../../managers/SearchManager";
import { UserManager } from "../../managers/UserManager";
import { Chain } from "../../services/solana/types";

const router = express.Router();

router.post(
    '/api/v1/search',
    [
        body("query").notEmpty().withMessage("query is not valid"),
    ],
    validateRequest,
    jwt({ secret: process.env.JWT_SECRET_KEY!, algorithms: [process.env.JWT_ALGORITHM], credentialsRequired: true }),
    validateAuth(),
    async (req: Request, res: Response) => {
        const userId = req.accessToken?.userId;
        if (!userId){
            throw new NotAuthorizedError();
        }
        const user = await UserManager.getUserById(userId);
        if (!user){
            throw new NotAuthorizedError();
        }

        const query = '' + req.body.query;
        const tokens = await SearchManager.search(user.defaultChain || Chain.SOLANA, query, userId);

        res.status(200).send({ query, tokens });
    }
);

export { router as searchRouter };
