import axios from "axios";
import { LogManager } from "./LogManager";
import { Chain, kChains } from "../services/solana/types";
import { EnvManager } from "./EnvManager";
import { SystemNotificationsManager } from "./SytemNotificationsManager";

export const kServiceKey = 'KjeisSkasfsJK21-sd2lsdksjE3L-13LRKJ';

export class MicroserviceManager {
    // static baseUrl = 'http://127.0.0.1:3340/api/v1/service';

    static async geyserResubscribe(){
        // send POST API to /geyser/resubscribe with axios
        console.log('MicroserviceManager geyserResubscribe');
        
        for (const key in kChains) {
            const chain = kChains[key];                
            try {
                const { data } = await axios({
                    url: `http://127.0.0.1:${chain.geyserPort}/api/v1/service/geyser/resubscribe`,
                    method: 'post',
                    headers: {
                        'Content-Type': 'application/json',
                        'serviceKey': kServiceKey
                    },
                });
            }
            catch (e: any){
                LogManager.error('MicroserviceManager', `geyserResubscribe for ${key}`, 'error', e?.response?.data?.message);
                SystemNotificationsManager.sendSystemMessage(`🔴 Geyser microservice is not running. Please check the logs.`);
            }
        }
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
        }
        catch (e: any){
            LogManager.error('MicroserviceManager', 'receivedTx', 'error', e?.response?.data?.message);
            SystemNotificationsManager.sendSystemMessage(`🔴 Main microservice is not running. Please check the logs.`);
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
            LogManager.error('MicroserviceManager', 'sendMessageToTelegram', 'error', e);
            SystemNotificationsManager.sendSystemMessage(`🔴 Telegram microservice is not running. Please check the logs.`);
        }
    }

    static async getTokensPrices(chain: Chain, mints: string[]): Promise<{address: string, price: number}[]> {
        try {
            const { data } = await axios({
                url: `http://127.0.0.1:3350/api/v1/service/prices/tokensPrices`,
                method: 'post',
                headers: {
                    'Content-Type': 'application/json',
                    'serviceKey': kServiceKey
                },
                data: {
                    chain,
                    mints
                }
            });

            console.log('MicroserviceManager', 'getTokensPrices', data);

            return data.prices;
        }
        catch (e: any){
            // LogManager.error('MicroserviceManager', 'getTokensPrices', 'error', e?.response?.data?.message);
            SystemNotificationsManager.sendSystemMessage(`🔴 Prices microservice is not running. Please check the logs.`);
        }

        return [];
    }

}