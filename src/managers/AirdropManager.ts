export interface IAirdropInfo {
    walletAddress: string;
    tokens: number;
}

export class AirdropManager {

    static async fetchSnsAirdropInfo(wallets: string[]): Promise<IAirdropInfo[]> {
        const airdropInfo: IAirdropInfo[] = [];

        for (const walletAddress of wallets) {
            const tokens = await this.fetchSnsAirdropInfoForWallet(walletAddress);
            if (tokens > 0) {
                airdropInfo.push({ walletAddress, tokens });
            }
        }

        return airdropInfo;
    }

    static async fetchSnsAirdropInfoForWallet(walletAddress: string): Promise<number> {
        try {
            const response = await fetch(`https://airdrop.sns.id/api/status/${walletAddress}`);
            if (!response.ok) {
                throw new Error(`Error fetching airdrop info: ${response.statusText}`);
            }
            const data: any = await response.json();
            return (data?.amount_locked_withdrawable || 0) / (10 ** 5);
        } catch (error) {
            console.error("Error fetching airdrop info:", error);
            return 0;
        }
    }

}