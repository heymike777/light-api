import axios from "axios";
import { LogManager } from "./LogManager";

export const kServiceKey = 'KjeisSkasfsJK21-sd2lsdksjE3L-13LRKJ';

export class MicroserviceManager {
    static baseUrl = 'http://127.0.0.1:3340/api/v1/service';

    static async geyserResubscribe(){
        // send POST API to /geyser/resubscribe with axios
        
        try {
            const { data } = await axios({
                url: `${this.baseUrl}/geyser/resubscribe`,
                method: 'post',
                headers: {
                    'Content-Type': 'application/json',
                    'serviceKey': kServiceKey
                },
            });

            LogManager.log('geyserResubscribe', data);
        }
        catch (e: any){
            LogManager.error('MicroserviceManager', 'geyserResubscribe', 'error', e?.response?.data?.message);
        }
    }

    static async receivedTx(geyserId: string, signature: string, txData: string){
        try {
            const { data } = await axios({
                url: `${this.baseUrl}/main/received-tx`,
                method: 'post',
                headers: {
                    'Content-Type': 'application/json',
                    'serviceKey': kServiceKey
                },
                data: {
                    geyserId,
                    signature,
                    data: txData
                }
            });

            LogManager.log('receivedTx', data);
        }
        catch (e: any){
            LogManager.error('MicroserviceManager', 'receivedTx', 'error', e?.response?.data?.message);
        }
    }

    static async sendMessageToTelegram(messageData: string){
        try {
            const { data } = await axios({
                url: `${this.baseUrl}/telegram/send-message`,
                method: 'post',
                headers: {
                    'Content-Type': 'application/json',
                    'serviceKey': kServiceKey
                },
                data: {
                    messageData
                }
            });

            LogManager.log('sendMessageToTelegram', data);
        }
        catch (e: any){
            LogManager.error('MicroserviceManager', 'sendMessageToTelegram', 'error', e?.response?.data?.message);
        }
    }

}