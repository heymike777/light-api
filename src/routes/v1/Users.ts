import express, { Request, Response } from "express";
import jwt from "express-jwt";
import { validateAuth } from "../../middlewares/ValidateAuth";
import { NotAuthorizedError } from "../../errors/NotAuthorizedError";
import { body } from "express-validator";
import { validateRequest } from "../../middlewares/ValidateRequest";
import { FirebaseManager } from "../../managers/FirebaseManager";
import { Helpers } from "../../services/helpers/Helpers";
import { PageToken } from "../../models/PageToken";
import { UserTransaction } from "../../entities/UserTransaction";
import { WalletManager } from "../../managers/WalletManager";
import { ChatWallets, TransactionApiResponse } from "../../models/types";
import { ExplorerManager } from "../../services/explorers/ExplorerManager";
import { UserManager } from "../../managers/UserManager";

const router = express.Router();

router.get(
    '/api/v1/users',
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
   
      res.status(200).send({ user });
    }
);

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
      const platform = req.body.platform;
      await FirebaseManager.savePushToken(userId, deviceId, pushToken, platform);

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
      console.log("LOGOUT", "userId", userId, "deviceId", deviceId, "body:", req.body, "query:", req.query, "params:", req.params);

      if (deviceId){
        await FirebaseManager.deletePushTokens(userId, deviceId);
      }

      res.status(200).send({success: true});
    }
);

router.post(
    '/api/v1/users/:userId/transactions',
    jwt({ secret: process.env.JWT_SECRET_KEY!, algorithms: [process.env.JWT_ALGORITHM], credentialsRequired: true }),
    validateAuth(),  
    async (req: Request, res: Response) => {
        const userId = req.accessToken?.userId;
        if (!userId){
            throw new NotAuthorizedError();
        }

        const ipAddress = Helpers.getIpAddress(req);
        const user = await UserManager.getUserById(userId);
        if (ipAddress && user.lastIpAddress != ipAddress){
            user.lastIpAddress = ipAddress;
            user.save();
        }

        console.log('!headers', req.headers);

        let pageToken = Helpers.parsePageToken(req);
        let existingIds = pageToken?.ids || [];
        const kPageSize = pageToken?.pageSize || 10;

        const transactions = await UserTransaction.find({userId: userId, _id: {$nin: existingIds}}).sort({createdAt: -1}).limit(kPageSize+1).exec();
        const hasMore = transactions.length > kPageSize;
        if (hasMore){
            transactions.pop();
        }
        const transactionsIds = transactions.map((transaction) => transaction.id.toString());

        existingIds.push(...transactionsIds);    
        const newPageToken: PageToken = new PageToken(existingIds, kPageSize);

        const wallets = await WalletManager.fetchWalletsByUserId(userId);
        const chat: ChatWallets = { id: -1, wallets: wallets };

        const parsedTransactions: TransactionApiResponse[] = [];
        for (const transaction of transactions) {
            const parsedTx = transaction.parsedTx;
            const changedWallets = transaction.changedWallets || [];
            const tokens = transaction.tokens || [];
            const assetToken = tokens?.find((token) => token.nft);
            // const info = await WalletManager.processTx(parsedTx, assetToken?.nft, chat);
            parsedTransactions.push({
                title: parsedTx.title,
                description: parsedTx.description?.plain ? Helpers.replaceAddressesWithPretty(parsedTx.description.plain, parsedTx.description?.addresses, wallets, tokens) : undefined,
                explorerUrl: ExplorerManager.getUrlToTransaction(parsedTx.signature),
                asset: assetToken?.nft,
                signature: parsedTx.signature,
                blockTime: parsedTx.blockTime,
                wallets: changedWallets,
                tokens: tokens,
            });
        }

        console.log("GET TRANSACTIONS RETURN", "hasMore", hasMore, "newPageToken", newPageToken);


        res.status(200).send({
            hasMore: hasMore,
            pageToken: newPageToken,
            transactions: parsedTransactions,
        });
    }
);

export { router as usersRouter };
