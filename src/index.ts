import express from 'express';
import 'express-async-errors';
import { json } from 'body-parser';
import 'reflect-metadata';
import cors from 'cors';
import mongoose from 'mongoose';

import './services/helpers/Secrets'
import { NotFoundError } from './errors/NotFoundError';
import { errorHandler } from './middlewares/ErrorHandler';

import cron from 'node-cron';
import { MigrationManager } from './services/MigrationManager';
import { BotManager } from './managers/bot/BotManager';
import { User } from './entities/User';
import { Message } from './entities/Message';
import { Wallet } from './entities/Wallet';
import { JitoWebsocketManager } from './services/solana/JitoWebsocketManager';
import { YellowstoneManager } from './services/solana/geyser/YellowstoneManager';
import { WalletManager } from './managers/WalletManager';
import { Program } from './entities/Program';
import { TokenManager } from './managers/TokenManager';
import { UserManager } from './managers/UserManager';
import { authRouter } from './routes/v1/Auth';
import { AccessToken } from './models/AccessToken';
import { walletsRouter } from './routes/v1/Wallets';
import { PushToken } from './entities/PushToken';
import { Auth } from './entities/Auth';
import { UserRefClaim } from './entities/UserRefClaim';
import { usersRouter } from './routes/v1/Users';
import { UserTransaction } from './entities/UserTransaction';
import { testRouter } from './routes/v1/Test';
import { webhooksRouter } from './routes/v1/Webhooks';
import { configRouter } from './routes/v1/Config';
import { Subscription } from './entities/payments/Subscription';
import { AppleLog } from './entities/payments/AppleLog';
import { paymentsRouter } from './routes/v1/Payments';
import axios from 'axios';

const app = express();
app.use(json());
app.use(cors());

declare global {
  namespace Express {
    interface Request {
      accessToken?: AccessToken,
    }
  }
}

if (process.env.API_ENABLED == 'true'){
    app.use(authRouter);
    app.use(walletsRouter);
    app.use(usersRouter);
    app.use(testRouter);
    app.use(webhooksRouter);
    app.use(configRouter);
    app.use(paymentsRouter);
}

app.all('*', async () => {
    throw new NotFoundError();
});

app.use(errorHandler);

const start = async () => {
    await mongoose.connect(process.env.MONGODB_CONNECTION_URL!);
    console.log('Connected to mongodb!');

    await User.syncIndexes();
    await UserRefClaim.syncIndexes();
    await UserTransaction.syncIndexes();
    await Message.syncIndexes();
    await Wallet.syncIndexes();
    await Program.syncIndexes();
    await Auth.syncIndexes();
    await PushToken.syncIndexes();
    await Subscription.syncIndexes();
    await AppleLog.syncIndexes();

    const port = process.env.PORT;
    app.listen(port, () => {
        console.log(`Listening on port ${port}.`);
        onExpressStarted();
    });
}

const onExpressStarted = async () => {
    setupCron();
    setupBot();

    await WalletManager.fetchAllWalletAddresses();
    await TokenManager.updateTokensPrices();
    JitoWebsocketManager.getInstance();
    // await JitoManager.initSearcherClient();
    YellowstoneManager.createInstances();

    await MigrationManager.migrate();
}

const setupCron = async () => {
    cron.schedule('*/10 * * * * *', () => {
        //TODO: for now it's every 10 seconds, but on productions set it to every second
        TokenManager.updateTokensPrices();
    });

    cron.schedule('* * * * *', () => {
        // once a minute
        TokenManager.fetchTokensInfo();
        UserManager.cleanOldCache();
        YellowstoneManager.cleanupProcessedSignatures();

        // console.log('Cron', 'tokens:', TokenManager.tokens);
    });

}

const setupBot = async () => {
    await BotManager.getInstance();
}

start();