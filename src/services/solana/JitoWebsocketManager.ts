import WebSocket from 'ws';
import { LogManager } from '../../managers/LogManager';

export class JitoWebsocketManager {
    url: string = 'ws://bundles-api-rest.jito.wtf/api/v1/bundles/tip_stream';
    ws: WebSocket;
    tipsAmount: {
        landed_tips_25th_percentile: number,
        landed_tips_50th_percentile: number,
        landed_tips_75th_percentile: number,
        landed_tips_95th_percentile: number,
        landed_tips_99th_percentile: number,
        ema_landed_tips_50th_percentile: number        
    } = {
        landed_tips_25th_percentile: 0.001,
        landed_tips_50th_percentile: 0.001,
        landed_tips_75th_percentile: 0.001,
        landed_tips_95th_percentile: 0.001,
        landed_tips_99th_percentile: 0.001,
        ema_landed_tips_50th_percentile: 0.001   
    };

    constructor(){
        LogManager.log(process.env.SERVER_NAME, 'JitoWebsocketManager constructor');
        
        JitoWebsocketManager.instance = this;

        this.ws = new WebSocket(this.url, {
            perMessageDeflate: false
        });

        this.ws.on('open', () => {
            LogManager.log(process.env.SERVER_NAME, 'Jito Websocket connected');
        });

        this.ws.on('close', () => {
            LogManager.log(process.env.SERVER_NAME, 'Jito Websocket closed');
        });

        this.ws.on('error', (err) => {
            LogManager.log(process.env.SERVER_NAME, 'Jito Websocket error:', err);
        });

        this.ws.on('message', (data) => {
            try {
                // LogManager.log(process.env.SERVER_NAME, 'Jito Websocket message:', data.toString());
                const msg = JSON.parse(data.toString());
                this.tipsAmount = msg[0];    
                // LogManager.log('!!! this.tipsAmount', this.tipsAmount);
            }
            catch (error){
                LogManager.error('JitoWebsocketManager', 'error:', error);
            }
        });
    }

    // ### static methods

    static instance?: JitoWebsocketManager;
    static getInstance(): JitoWebsocketManager | undefined {
        if (!this.instance){
            this.instance = new JitoWebsocketManager();
        }

        return this.instance;
    }

}