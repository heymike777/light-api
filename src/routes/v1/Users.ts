import express, { Request, Response } from "express";
import jwt from "express-jwt";
import { validateAuth } from "../../middlewares/ValidateAuth";
import { NotAuthorizedError } from "../../errors/NotAuthorizedError";
import { body } from "express-validator";
import { validateRequest } from "../../middlewares/ValidateRequest";
import { FirebaseManager } from "../../managers/FirebaseManager";
import { Helpers } from "../../services/helpers/Helpers";
import { PageToken } from "../../models/PageToken";
import { IUserTransaction, UserTransaction } from "../../entities/users/UserTransaction";
import { WalletManager } from "../../managers/WalletManager";
import { ChatWallets, TransactionApiResponse } from "../../models/types";
import { ExplorerManager } from "../../services/explorers/ExplorerManager";
import { UserManager } from "../../managers/UserManager";
import { ProgramManager } from "../../managers/ProgramManager";
import { SwapManager } from "../../managers/SwapManager";
import { BadRequestError } from "../../errors/BadRequestError";
import { User } from "../../entities/users/User";
import { Announcement, AnnouncementsManager } from "../../managers/AnnouncementsManager";
import { token } from "@coral-xyz/anchor/dist/cjs/utils";
import { TokenManager } from "../../managers/TokenManager";
import { LogManager } from "../../managers/LogManager";
import { Subscription } from "../../entities/payments/Subscription";
import { PushToken } from "../../entities/PushToken";
import { UserTraderProfile } from "../../entities/users/TraderProfile";
import { Wallet } from "../../entities/Wallet";
import { RedisManager } from "../../managers/db/RedisManager";

const router = express.Router();

router.get(
    '/api/v1/users',
    jwt({ secret: process.env.JWT_SECRET_KEY!, algorithms: [process.env.JWT_ALGORITHM], credentialsRequired: true }),
    validateAuth(),  
    async (req: Request, res: Response) => {
        const times: {time: number, message: string, took: number}[] = [];
        times.push({time: Date.now(), message: "start", took: 0});

        const userId = req.accessToken?.userId;
        if (!userId){
            throw new NotAuthorizedError();
        }
        times.push({time: Date.now(), message: "first", took: Date.now()-times[times.length-1].time});


        const user = await UserManager.getUserById(userId, true);
        if (!user){
            throw new NotAuthorizedError();
        }

        times.push({time: Date.now(), message: "got user", took: Date.now()-times[times.length-1].time});


        LogManager.log("GET USER", "userId", userId, "user", user);
        times.push({time: Date.now(), message: "logged", took: Date.now()-times[times.length-1].time});

        res.status(200).send({ user, times: times, timesGetUserById: user.tmp });
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
            const allEngineIds = SwapManager.engines.map((engine) => engine.id);
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

router.delete(
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

        await User.deleteOne({ _id: userId });
        await Subscription.deleteMany({ userId: userId });
        await PushToken.deleteMany({ userId: userId });
        await Wallet.deleteMany({ userId: userId });
        await UserTraderProfile.updateMany({ userId: userId }, { $set: { active: false } });
        await UserTransaction.deleteMany({ userId: userId });

        res.status(200).send({success: true});
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
      LogManager.log("LOGOUT", "userId", userId, "deviceId", deviceId, "body:", req.body, "query:", req.query, "params:", req.params);

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
        const times: {time: number, message: string, took: number}[] = [];
        times.push({time: Date.now(), message: "start", took: 0});

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
        times.push({time: Date.now(), message: "got user", took: Date.now()-times[times.length-1].time});

        let pageToken = Helpers.parsePageToken(req);
        let existingIds = pageToken?.ids || [];
        const kPageSize = pageToken?.pageSize || 10;
        times.push({time: Date.now(), message: "parsed page token", took: Date.now()-times[times.length-1].time});

        let transactions: IUserTransaction[] = [];
        const transactionsIds: string[] = [];

        const redisTxs = await RedisManager.getUserTransactions(userId);
        for (const tx of redisTxs) {
            if (!existingIds.includes(tx.id)){
                transactions.push(tx);
                transactionsIds.push(tx.id);
                if (transactions.length >= kPageSize+1){
                    break;
                }
            }
        }
        console.log('FROM REDIS', transactions.length, 'transactions');
        times.push({time: Date.now(), message: `got transactions from redis (${transactions.length} txs)`, took: Date.now()-times[times.length-1].time});

        if (transactions.length < kPageSize+1){
            const ids = [...existingIds, ...transactionsIds];
            const limit = kPageSize+1-transactions.length;
            const tmpTxs = await UserTransaction.find({userId: userId, _id: {$nin: ids}}).sort({createdAt: -1}).limit(limit).exec();
            transactions.push(...tmpTxs);
            transactionsIds.push(...tmpTxs.map((tx) => tx.id.toString()));
            times.push({time: Date.now(), message: "got transactions from mongo", took: Date.now()-times[times.length-1].time});
        }

        const hasMore = transactions.length > kPageSize;
        if (hasMore){
            transactions.pop();
        }

        existingIds.push(...transactionsIds);    
        const newPageToken: PageToken = new PageToken(existingIds, kPageSize);

        const wallets = await WalletManager.fetchWalletsByUserId(userId);
        const chat: ChatWallets = { user: user, wallets: wallets };
        times.push({time: Date.now(), message: "fetched wallets", took: Date.now()-times[times.length-1].time});

        const parsedTransactions: TransactionApiResponse[] = [];
        for (const transaction of transactions) {
            const parsedTx = transaction.parsedTx;
            const changedWallets = transaction.changedWallets || [];
            let tokens = transaction.tokens || [];
            const assetToken = tokens?.find((token) => token.nft);
            // const info = await WalletManager.processTx(parsedTx, assetToken?.nft, chat);

            let description = transaction.description;
            if (!description && parsedTx){
                const txDescription = ProgramManager.findTxDescription(parsedTx.parsedInstructions, chat.wallets);
                const plainText = txDescription?.html ? Helpers.htmlToPlainText(txDescription?.html) : undefined;
                description = plainText ? Helpers.replaceAddressesWithPretty(plainText, txDescription?.addresses, wallets, tokens) : undefined;    
            }

            tokens = tokens.filter((token) => !token.nft);
            tokens = tokens.filter((token) => !TokenManager.excludedTokens.includes(token.address));

            if (tokens.length > 0){
                await TokenManager.fillTokenModelsWithData(tokens);
            }

            parsedTransactions.push({
                title: transaction.title || parsedTx?.title || '[TX]',
                description: description,
                explorerUrl: parsedTx ? ExplorerManager.getUrlToTransaction(parsedTx.signature) : undefined,
                asset: assetToken?.nft,
                signature: parsedTx?.signature,
                blockTime: parsedTx?.blockTime || Math.round(transaction.createdAt.getTime()/1000),
                wallets: changedWallets && changedWallets.length > 0 ? changedWallets : undefined,
                tokens: tokens && tokens.length > 0 ? tokens : undefined,
            });

            times.push({time: Date.now(), message: "tx processed", took: Date.now()-times[times.length-1].time});

        }

        // LogManager.log("GET TRANSACTIONS RETURN", "hasMore", hasMore, "newPageToken", newPageToken);

        let announcements: Announcement[] | undefined = undefined;
        if (!pageToken || !pageToken?.ids || pageToken.ids.length==0) {
            announcements = await AnnouncementsManager.getAnnouncements();
        }

        times.push({time: Date.now(), message: "got announcements", took: Date.now()-times[times.length-1].time});

        for (const time of times){
            LogManager.log("GET TRANSACTIONS", "time", time.time, "message", time.message);
        }


        res.status(200).send({
            hasMore: hasMore,
            pageToken: newPageToken,
            transactions: parsedTransactions,
            announcements,
            times: times,
        });
    }
);

export { router as usersRouter };
