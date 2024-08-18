import WebSocket from 'ws';

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
        console.log(new Date(), process.env.SERVER_NAME, 'JitoWebsocketManager constructor');
        
        JitoWebsocketManager.instance = this;

        this.ws = new WebSocket(this.url, {
            perMessageDeflate: false
        });

        this.ws.on('open', () => {
            console.log(new Date(), process.env.SERVER_NAME, 'Jito Websocket connected');
        });

        this.ws.on('close', () => {
            console.log(new Date(), process.env.SERVER_NAME, 'Jito Websocket closed');
        });

        this.ws.on('error', (err) => {
            console.log(new Date(), process.env.SERVER_NAME, 'Jito Websocket error:', err);
        });

        this.ws.on('message', (data) => {
            try {
                // console.log(new Date(), process.env.SERVER_NAME, 'Jito Websocket message:', data.toString());
                const msg = JSON.parse(data.toString());
                this.tipsAmount = msg[0];    
                // console.log('!!! this.tipsAmount', this.tipsAmount);
            }
            catch (error){
                console.error(new Date(), 'JitoWebsocketManager', 'error:', error);
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