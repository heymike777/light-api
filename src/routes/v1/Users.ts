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
import { ProgramManager } from "../../managers/ProgramManager";
import { TraderManager } from "../../managers/TraderManager";
import { BadRequestError } from "../../errors/BadRequestError";
import { User } from "../../entities/User";
import { Announcement, AnnouncementsManager } from "../../managers/AnnouncementsManager";
import { token } from "@coral-xyz/anchor/dist/cjs/utils";
import { TokenManager } from "../../managers/TokenManager";

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

      const user = await UserManager.getUserById(userId, true);
      if (!user){
        throw new NotAuthorizedError();
      }
   
      res.status(200).send({ user });
    }
);

router.put(
    '/api/v1/users',
    [
        body("engine").optional().isString().withMessage("engine is not valid"),
    ],
    validateRequest,
    jwt({ secret: process.env.JWT_SECRET_KEY!, algorithms: [process.env.JWT_ALGORITHM], credentialsRequired: true }),
    validateAuth(),  
    async (req: Request, res: Response) => {
        const userId = req.accessToken?.userId;
        if (!userId){
            throw new NotAuthorizedError();
        }
    
        if (req.body.engine){
            const engine = req.body.engine;
            const allEngineIds = TraderManager.engines.map((engine) => engine.id);
            if (!allEngineIds.includes(engine)){
                throw new BadRequestError("Engine not found");
            }
            await User.updateOne({ _id: userId }, {
                $set: {
                    engine: engine,
                }
            });
        }

        const user = await UserManager.getUserById(userId, true);

        res.status(200).send({success: true, user});
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
        const user = await UserManager.getUserById(userId, true);
        if (ipAddress && user.lastIpAddress != ipAddress){
            user.lastIpAddress = ipAddress;
            user.save();
        }

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
        const chat: ChatWallets = { user: user, wallets: wallets };

        const parsedTransactions: TransactionApiResponse[] = [];
        for (const transaction of transactions) {
            const parsedTx = transaction.parsedTx;
            const changedWallets = transaction.changedWallets || [];
            const tokens = transaction.tokens || [];
            const assetToken = tokens?.find((token) => token.nft);
            // const info = await WalletManager.processTx(parsedTx, assetToken?.nft, chat);

            if (tokens.length > 0){
                await TokenManager.fillTokenModelsWithData(tokens);
            }

            const txDescription = ProgramManager.findTxDescription(parsedTx.parsedInstructions, chat.wallets);

            parsedTransactions.push({
                title: parsedTx.title,
                description: txDescription?.plain ? Helpers.replaceAddressesWithPretty(txDescription.plain, txDescription?.addresses, wallets, tokens) : undefined,
                explorerUrl: ExplorerManager.getUrlToTransaction(parsedTx.signature),
                asset: assetToken?.nft,
                signature: parsedTx.signature,
                blockTime: parsedTx.blockTime,
                wallets: changedWallets,
                tokens: tokens,
            });
        }

        // console.log("GET TRANSACTIONS RETURN", "hasMore", hasMore, "newPageToken", newPageToken);

        let announcements: Announcement[] | undefined = undefined;
        if (!pageToken || !pageToken?.ids || pageToken.ids.length==0) {
            announcements = await AnnouncementsManager.getAnnouncements();
        }

        res.status(200).send({
            hasMore: hasMore,
            pageToken: newPageToken,
            transactions: parsedTransactions,
            announcements,
        });
    }
);

export { router as usersRouter };
