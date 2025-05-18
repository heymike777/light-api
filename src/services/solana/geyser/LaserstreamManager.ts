import { SubscribeRequest, SubscribeUpdate } from '@triton-one/yellowstone-grpc';
import { subscribe, CommitmentLevel, LaserstreamConfig } from 'helius-laserstream';
import { LogManager } from '../../../managers/LogManager';
import { YellowstoneManager } from './YellowstoneManager';

export class LaserstreamManager {

    async subscribe(){
        const config = {
            apiKey: process.env.HELIUS_API_KEY!,
            endpoint: 'https://laserstream-mainnet-ams.helius-rpc.com'
        };

        const subscriptionRequest: SubscribeRequest = {
            accounts: {},
            accountsDataSlice: [],
            commitment: CommitmentLevel.CONFIRMED,
            slots: {},
            transactions: {},
            transactionsStatus: {},
            blocks: {
                blockSubscribe: {
                    accountInclude: [],
                    includeTransactions: true,
                    includeAccounts: false,
                    includeEntries: false,
                }
            },
            blocksMeta: {},
            entry: {}
        };

        subscribe(config, subscriptionRequest, this.onData, this.onError);
    }

    onData(data: SubscribeUpdate) {
        LogManager.forceLog('Laserstream onData:', data);

        if (data.block?.transactions){
            for (const tx of data.block?.transactions) {
                if (!tx.isVote && !tx.meta?.err){
                    console.log('Laserstream transaction:', tx.signature);
                    
                    YellowstoneManager.receivedTx('laserstream', tx);
                }
            }
        }
    }

    onError(error: Error) {
        LogManager.error('Laserstream error:', error);
    }

}