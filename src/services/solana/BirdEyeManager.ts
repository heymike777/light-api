import axios from 'axios';
import { LogManager } from '../../managers/LogManager';

export class BirdEyeManager {

    static apiUrl = `https://public-api.birdeye.so/`;

    static async fetchTokenPrice(address: string): Promise<number> {
        try {
            const response = await axios.get(`${this.apiUrl}public/price?address=${address}`, {
                headers: {
                    'Content-Type': 'application/json',
                    'x-chain': 'solana',
                    'x-api-key': process.env.BIRDEYE_API_KEY!
                }
            });

            LogManager.log(process.env.SERVER_NAME, 'response?.data?.data', response?.data?.data);
            return response?.data?.data?.value || 0;    
        }
        catch (error) {
            LogManager.error('BirdEyeManager', 'fetchTokenPrice', error);
        }

        return 0;
    }



}