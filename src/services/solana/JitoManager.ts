import * as web3 from '@solana/web3.js';
import * as jito from 'jito-ts';
import { SolanaManager } from './SolanaManager';
import { JitoWebsocketManager } from './JitoWebsocketManager';
import axios from 'axios';
import { Priority } from './types';

export class JitoManager {

    static highTipsAmount = process.env.JITO_TIPS ? +process.env.JITO_TIPS : 0.001;
    static tipsPublicKeys = ['96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5', 'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe', 'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY', 'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49', 'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh', 'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt', 'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL', '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT'];
    static searcherClient = jito.searcher.searcherClient(process.env.JITO_URL!);
    static myBundleIds: string[] = [];

    static getTipsAmount(maxTipsAmount: number = 0.001): number {
        let tipsAmount = 0.001;
        const allTips = JitoWebsocketManager.getInstance()?.tipsAmount;
        if (allTips && allTips.landed_tips_95th_percentile > 0){
            tipsAmount = allTips.landed_tips_95th_percentile + 0.00001;
        }

        if (maxTipsAmount != -1 && tipsAmount > maxTipsAmount){
            tipsAmount = maxTipsAmount;
        }

        return Math.ceil(tipsAmount * web3.LAMPORTS_PER_SOL);
    }

    static getTipsPubkey(): web3.PublicKey {
        const publicKey = this.tipsPublicKeys[Math.floor(Math.random() * this.tipsPublicKeys.length)];
        return new web3.PublicKey(publicKey);
    }

    static getAddTipsInstruction(fromPubkey: web3.PublicKey, tipsAmount?: number): web3.TransactionInstruction {
        if (tipsAmount == undefined) { tipsAmount = this.getTipsAmount(); }

        return web3.SystemProgram.transfer({
            fromPubkey: fromPubkey,
            toPubkey: this.getTipsPubkey(),
            lamports: tipsAmount
        });
    }

    static addTipsToTransaction(tx: web3.Transaction, fromPubkey: web3.PublicKey) {
        tx.add(this.getAddTipsInstruction(fromPubkey));
    }

    static async sendTransaction(tx: web3.VersionedTransaction, keypair: web3.Keypair, addTips: boolean = true, recentBlockhash?: string, priority: Priority = Priority.HIGH): Promise<string | undefined> {
        try{
            return await this.sendBundle([tx], keypair, addTips, recentBlockhash, priority);
        }
        catch (error){
            console.log(new Date(), process.env.SERVER_NAME, 'JITO', 'sendTransaction', 'error:', error);
        }
    }

    static lastSendBundleTime: number = 0;
    static async sendBundle(txs: web3.VersionedTransaction[], keypair: web3.Keypair, addTips: boolean = true, recentBlockhash?: string, priority: Priority = Priority.HIGH): Promise<string | undefined> {        
        console.log(new Date(), process.env.SERVER_NAME, 'JITO', 'sendBundle', 'txs:', txs.length, 'addTips:', addTips, 'recentBlockhash:', recentBlockhash);
        const now = Date.now();
        // if (now - this.lastSendBundleTime < 250000){ // 250ms
        //     // too frequent. send through JitoSenders

        //     //TODO: if addTips is true, we need to create one more transaction for tips
        //     await this.sendBundleThroughJitoSenders(txs);
        //     return;
        // }

        try{
            this.lastSendBundleTime = now;
            const bundle = new jito.bundle.Bundle(txs, 5);

            if (addTips) {
                if (!recentBlockhash){
                    recentBlockhash = (await SolanaManager.getRecentBlockhash()).blockhash;
                }
                if (!recentBlockhash) {
                    console.log(new Date(), process.env.SERVER_NAME, 'JITO', 'sendBundle', 'recentBlockhash is not available');
                    return;
                }

                const maxTipsAmount = priority == Priority.HIGH ? this.highTipsAmount : 0.0001;
                const tipsAmount = this.getTipsAmount(maxTipsAmount);

                bundle.addTipTx(keypair, tipsAmount, this.getTipsPubkey(), recentBlockhash);
            }

            const bundleId = await this.searcherClient.sendBundle(bundle);
            this.myBundleIds.push(bundleId);
            console.log(new Date(), process.env.SERVER_NAME, 'JITO', 'sendBundle', 'bundleId:', bundleId);

            return bundleId;
        }
        catch (error){
            console.log(new Date(), process.env.SERVER_NAME, 'JITO', 'sendBundle', 'error:', error);
        }
    }

    static async sendBundleThroughJitoSenders(txs: web3.VersionedTransaction[]) {
        try{
            console.log(new Date(), process.env.SERVER_NAME, 'JITO', 'sendTransaction', 'as bundle');
            
            const transactions = txs.map(tx => {
                return Buffer.from(tx.serialize()).toString('base64');
            });

            let servers: string[] = [];
            if (process.env.LOCATION == 'NYC'){
                servers = ['208.68.37.67', '143.198.166.250', '143.198.170.61', '147.182.185.205', '143.198.174.137'];
            }
            else if (process.env.LOCATION == 'FRA'){
                servers = ['165.232.118.231', '165.232.126.188', '64.226.126.113', '64.226.118.194', '64.226.113.92'];
            }
            else if (process.env.LOCATION == 'AMS'){
                servers = ['146.190.19.109', '159.223.213.78', '188.166.109.252', '188.166.21.242', '188.166.110.18'];
            }
            else {
                // NYC
                servers = ['208.68.37.67', '143.198.166.250', '143.198.170.61', '147.182.185.205', '143.198.174.137'];
            }
            const server = servers[Math.floor(Math.random() * servers.length)];

            const result = await axios.post(`http://${server}:3000/api/v1/jito/send`, {
                transactions
            }, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            // console.log(new Date(), process.env.SERVER_NAME, 'JITO', 'sendBundle', 'result:', result);
        }
        catch (error){
            console.log(new Date(), process.env.SERVER_NAME, 'JITO', 'sendBundle', 'error:', error);
        }
    }

    static async initSearcherClient() {
        console.log(new Date(), process.env.SERVER_NAME, 'JITO initSearcherClient');

        this.searcherClient.onBundleResult((result) => {
            console.log(new Date(), process.env.SERVER_NAME, process.env.SERVER_NAME, 'JITO', 'onBundleResult', 'this.myBundleIds:', this.myBundleIds, 'result:', result);
            if (this.myBundleIds.includes(result.bundleId) === false) {
                return;
            }

            console.log(new Date(), process.env.SERVER_NAME, 'JITO', 'onBundleResult', 'result:', result);

        }, (error) => {
            console.log(new Date(), process.env.SERVER_NAME, 'JITO', 'onBundleResult', 'error:', error);        
        });
    }

    static async getBundleStatus(bundleId: string) {
        const result = await axios.post('https://mainnet.block-engine.jito.wtf/api/v1/bundles', {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getBundleStatuses",
            "params": [
              [
                bundleId
              ]
            ]
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        console.log(new Date(), process.env.SERVER_NAME, 'JITO', 'getBundleStatus', 'bundleId:', bundleId, 'result:', result.data);
        return result.data;
    }

}