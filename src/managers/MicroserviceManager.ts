import axios from "axios";
import { LogManager } from "./LogManager";
import { Chain } from "../services/solana/types";
import { EnvManager } from "./EnvManager";

export const kServiceKey = 'KjeisSkasfsJK21-sd2lsdksjE3L-13LRKJ';

export class MicroserviceManager {
    // static baseUrl = 'http://127.0.0.1:3340/api/v1/service';

    static async geyserResubscribe(){
        // send POST API to /geyser/resubscribe with axios
        console.log('MicroserviceManager geyserResubscribe');
        
        // chain == SOLANA
        try {
            const { data } = await axios({
                url: `http://127.0.0.1:3340/api/v1/service/geyser/resubscribe`,
                method: 'post',
                headers: {
                    'Content-Type': 'application/json',
                    'serviceKey': kServiceKey
                },
            });
        }
        catch (e: any){
            LogManager.error('MicroserviceManager', 'geyserResubscribe for solana', 'error', e?.response?.data?.message);
        }

        // chain == SONIC
        try {
            const { data } = await axios({
                url: `http://127.0.0.1:3344/api/v1/service/geyser/resubscribe`,
                method: 'post',
                headers: {
                    'Content-Type': 'application/json',
                    'serviceKey': kServiceKey
                },
            });
        }
        catch (e: any){
            LogManager.error('MicroserviceManager', 'geyserResubscribe for sonic', 'error', e?.response?.data?.message);
        }

        // chain == SONIC_TESTNET
        // try {
        //     const { data } = await axios({
        //         url: `http://127.0.0.1:3345/api/v1/service/geyser/resubscribe`,
        //         method: 'post',
        //         headers: {
        //             'Content-Type': 'application/json',
        //             'serviceKey': kServiceKey
        //         },
        //     });
        // }
        // catch (e: any){
        //     LogManager.error('MicroserviceManager', 'geyserResubscribe for sonic', 'error', e?.response?.data?.message);
        // }
    }

    static async receivedTx(geyserId: string, signature: string, txData: string){
        try {
            const { data } = await axios({
                url: `http://127.0.0.1:3333/api/v1/service/main/received-tx`,
                method: 'post',
                headers: {
                    'Content-Type': 'application/json',
                    'serviceKey': kServiceKey
                },
                data: {
                    geyserId,
                    signature,
                    chain: EnvManager.chain,
                    data: txData
                }
            });

            // LogManager.forceLog('receivedTx', data);
        }
        catch (e: any){
            LogManager.error('MicroserviceManager', 'receivedTx', 'error', e?.response?.data?.message);
        }
    }

    static async sendMessageToTelegram(messageData: string){
        try {
            const { data } = await axios({
                url: `http://127.0.0.1:3342/api/v1/service/telegram/send-message`,
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