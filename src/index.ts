import express from 'express';
import 'express-async-errors';
import { json } from 'body-parser';
import 'reflect-metadata';
import cors, { CorsOptions } from 'cors';
import mongoose from 'mongoose';

import './services/helpers/Secrets'
import { NotFoundError } from './errors/NotFoundError';
import { errorHandler } from './middlewares/ErrorHandler';

import { MigrationManager } from './services/MigrationManager';
import { BotManager } from './managers/bot/BotManager';
import { YellowstoneManager } from './services/solana/geyser/YellowstoneManager';
import { WalletManager } from './managers/WalletManager';
import { TokenManager } from './managers/TokenManager';
import { authRouter } from './routes/v1/Auth';
import { AccessToken } from './models/AccessToken';
import { walletsRouter } from './routes/v1/Wallets';
import { usersRouter } from './routes/v1/Users';
import { testRouter } from './routes/v1/Test';
import { webhooksRouter } from './routes/v1/Webhooks';
import { configRouter } from './routes/v1/Config';
import { MixpanelManager } from './managers/MixpanelManager';
import { CronManager } from './managers/CronManager';
import { giftCardsRouter } from './routes/v1/GiftCards';
import { LogManager } from './managers/LogManager';
import { traderProfilesRouter } from './routes/v1/TraderProfiles';
import { tradeRouter } from './routes/v1/Trade';
import { RedisManager } from './managers/db/RedisManager';
import { EnvManager } from './managers/EnvManager';
import { geyserServiceRouter } from './routes/v1/services/Geyser';
import { mainServiceRouter } from './routes/v1/services/Main';
import { telegramServiceRouter } from './routes/v1/services/Telegram';
import { initSolscanLabels } from './managers/constants/ValidatorConstants';
import { searchRouter } from './routes/v1/Search';
import { portfolioRouter } from './routes/v1/Portfolio';
import { WalletGeneratorManager } from './managers/WalletGeneratorManager';
import { Chain } from './services/solana/types';
import { SvmManager } from './managers/svm/SvmManager';
import { JitoManager } from './services/solana/JitoManager';
import { pricesServiceRouter } from './routes/v1/services/Prices';
import { RabbitManager } from './managers/RabbitManager';
import { LaserstreamManager } from './services/solana/geyser/LaserstreamManager';
import { adminRouter } from './routes/v1/Admin';
import { ServiceConnector } from './managers/microservices/ServiceConnector';
import { eventsRouter } from './routes/v1/Events';

// top of index.js
process.on('unhandledRejection', (err) => {
    // Specifically handle the "Invalid time value" error that's causing crashes
    if (err instanceof RangeError && err.message.includes('Invalid time value')) {
        LogManager.error('!UNHANDLED REJECTION (Invalid time value):', err);
        // Don't let this crash the process
        return;
    }
    
    LogManager.error('!UNHANDLED REJECTION:', err);
});
process.on('uncaughtException', (err) => {
    // Specifically handle the "Invalid time value" error that's causing crashes
    if (err instanceof RangeError && err.message.includes('Invalid time value')) {
        LogManager.error('!UNCAUGHT EXCEPTION (Invalid time value):', err);
        // Don't let this crash the process
        return;
    }
    
    LogManager.error('!UNCAUGHT EXCEPTION:', err);
});
process.on('exit', (code) => {
    LogManager.error(`!!! exiting with code ${code}`);
});
process.on('SIGTERM', () => {
    LogManager.error(`!!! received SIGTERM`);
});

const corsOptions: CorsOptions = {
    allowedHeaders: ['Content-Type', 'Authorization', 'x-light-platform', 'x-light-app-version'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // 'PATCH', 'HEAD'
    origin: '*',
    optionsSuccessStatus: 204,
}

const app = express();
app.use(json());
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

declare global {
  namespace Express {
    interface Request {
      accessToken?: AccessToken,
    }
  }
}

if (process.env.API_ENABLED == 'true' && EnvManager.isMainProcess) {
    app.use(authRouter);
    app.use(walletsRouter);
    app.use(usersRouter);
    // app.use(testRouter);
    app.use(webhooksRouter);
    app.use(configRouter);
    app.use(giftCardsRouter);
    app.use(traderProfilesRouter);
    app.use(tradeRouter);
    app.use(searchRouter);
    app.use(portfolioRouter);
    app.use(adminRouter);
    app.use(eventsRouter);
}

if (EnvManager.isMainProcess) {
    app.use(mainServiceRouter);
}
if (EnvManager.isGeyserProcess) {
    app.use(geyserServiceRouter);
}
if (EnvManager.isTelegramProcess) {
    app.use(telegramServiceRouter);
}
if (EnvManager.isPricesProcess) {
    app.use(pricesServiceRouter);
}

app.all('*', async () => {
    throw new NotFoundError();
});

app.use(errorHandler);

const start = async () => {
    LogManager.forceLog('Start');
    await mongoose.connect(process.env.MONGODB_CONNECTION_URL!);
    LogManager.forceLog('Connected to mongo');
    await connectToRedis();
    ServiceConnector.getInstance()

    // if (EnvManager.isTelegramProcess){
    //     RabbitManager.listenToTelegramMessages();
    // }

    const port = process.env.PORT;
    app.listen(port, () => {
        LogManager.forceLog(`Listening on port ${port}.`);
        onExpressStarted();
    });
}

const onExpressStarted = async () => {
    CronManager.setupCron();
    await TokenManager.fetchNativeTokenPriceFromRedis();

    if (EnvManager.isTelegramProcess) {
        setupBot();
    }
    if (EnvManager.isMainProcess) {
        initSolscanLabels();
    }
    if (EnvManager.isWalletGeneratorProcess) {
        await WalletGeneratorManager.start();
    }

    await MixpanelManager.init();
    await WalletManager.fetchAllWalletAddresses();

    if (EnvManager.isGeyserProcess){
        console.log('Geyser process started for chain:', EnvManager.chain);
        
        if (EnvManager.chain == Chain.SOLANA){
            // const laserstream = new LaserstreamManager();
            // await laserstream.subscribe();
    
            YellowstoneManager.createInstances();
        }
        else {
            const svm = new SvmManager(EnvManager.chain);
            await svm.subscribe();
        }
    }

    // await TokenManager.updateTokensPrices();
    // JitoWebsocketManager.getInstance();

    console.log('INIT_JITO_SEARCHER', process.env.INIT_JITO_SEARCHER);
    if (process.env.INIT_JITO_SEARCHER == 'true'){
        await JitoManager.initSearcherClient();
    }

    await MigrationManager.migrate();
}

const connectToRedis = async () => {
    LogManager.forceLog('Connecting to redis...');
    const redisManager = new RedisManager();
    await redisManager.connect();
    LogManager.forceLog('Connected to redis');
}  

const setupBot = async () => {
    await BotManager.init();
}

start();