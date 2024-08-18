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
import { BotManager } from './services/BotManager';

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

    // await Auth.syncIndexes();

    await MigrationManager.migrate();

    const port = process.env.PORT;
    app.listen(port, () => {
        console.log(`Listening on port ${port}.`);

        setupCron();
        setupBot();
    });
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