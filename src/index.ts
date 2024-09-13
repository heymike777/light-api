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
import { messagesRouter } from './routes/v1/Notifications';
import { BotManager } from './managers/bot/BotManager';
import { User } from './entities/User';
import { Message } from './entities/Message';
import { Wallet } from './entities/Wallet';
import { JitoWebsocketManager } from './services/solana/JitoWebsocketManager';
import { JitoManager } from './services/solana/JitoManager';
import { YellowstoneManager } from './services/solana/geyser/YellowstoneManager';
import { WalletManager } from './managers/WalletManager';

const app = express();
app.use(json());
app.use(cors());

if (process.env.API_ENABLED == 'true'){
    app.use(messagesRouter);
}

app.all('*', async () => {
    throw new NotFoundError();
});

app.use(errorHandler);

const start = async () => {
    await mongoose.connect(process.env.MONGODB_CONNECTION_URL!);
    console.log('Connected to mongodb!');

    await User.syncIndexes();
    await Message.syncIndexes();
    await Wallet.syncIndexes();

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
    JitoWebsocketManager.getInstance();
    // await JitoManager.initSearcherClient();
    if (process.env.SOLANA_GEYSER_RPC != 'NULL'){
        YellowstoneManager.getInstance();
    }

    await MigrationManager.migrate();
}

const setupCron = async () => {
    if (process.env.CRON_ENABLED == 'true'){
        // cron.schedule('* * * * *', () => {
        //     console.log('running a task every minute');
        // });
    }
}

const setupBot = async () => {
    await BotManager.getInstance();
}

start();