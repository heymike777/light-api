import axios from "axios";

export class JupiterManager {

    static async getPrices(mints: string[]): Promise<{address: string, price: number}[]> {        
        if (mints.length === 0) {
            return [];
        }

        try {
            const url = `https://api.jup.ag/price/v2?ids=${mints.join(',')}`;
            const response = await axios.get(url);
            if (response.status === 200) {
                const data = response.data?.data;
                if (data) {
                    return Object.keys(data).map(key => {
                        return {
                            address: key,
                            price: +data[key].price,
                        };
                    });
                }
            }
        }
        catch (error) {
            // LogManager.error('JupiterManager', 'getPrices', error);
        }

        return [];
    }

}