import { Context } from "grammy";
import { BotManager } from "../bot/BotManager";

export interface IAirdropInfo {
    walletAddress: string;
    tokensToClaim: number;
    tokensClaimed?: number;
}

export class AirdropManager {

    static async fetchAirdropInfo(wallets: string[], airdropId: string, ctx?: Context): Promise<IAirdropInfo[]> {
        const pendingMsg = ctx ? await BotManager.reply(ctx, `Fetching ${airdropId} airdrop info (0/${wallets.length})...`) : undefined;
        const airdropInfo: IAirdropInfo[] = [];

        let index = 0;
        for (const walletAddress of wallets) {
            let info: IAirdropInfo | undefined;
            
            if (airdropId == 'SNS'){
                info = await this.fetchSnsAirdropInfoForWallet(walletAddress);
            }
            else if (airdropId == 'HUMA'){
                info = await this.fetchHumaAirdropInfoForWallet(walletAddress);
            }

            if (info) {
                airdropInfo.push(info);
            }

            if (ctx && pendingMsg) {
                await BotManager.editMessage(ctx, `Fetching ${airdropId} airdrop info (${index+1}/${wallets.length})...`, undefined, pendingMsg.message_id, pendingMsg.chat.id);
            }
            index++;
        }

        if (ctx && pendingMsg){
            await BotManager.deleteMessage(ctx, pendingMsg.message_id, pendingMsg.chat.id);
        }

        return airdropInfo;
    }

    static async fetchSnsAirdropInfoForWallet(walletAddress: string): Promise<IAirdropInfo | undefined> {
        const airdropId = 'SNS';
        try {
            const response = await fetch(`https://airdrop.sns.id/api/status/${walletAddress}`);
            if (!response.ok) {
                throw new Error(`Error fetching airdrop info: ${response.statusText}`);
            }
            const data: any = await response.json();

            if (data?.amount_locked_withdrawable === undefined) {
                return undefined;
            }

            const tokensToClaim = (data?.amount_locked_withdrawable || 0) / (10 ** 5);
            const tokensClaimed = (data?.amount_locked_withdrawn || 0) / (10 ** 5);
            return { walletAddress, tokensToClaim, tokensClaimed };
        } catch (error) {
            console.error(`Error fetching ${airdropId} airdrop info:`, error);
        }
        return undefined;
    }

    static async fetchHumaAirdropInfoForWallet(walletAddress: string): Promise<IAirdropInfo | undefined> {
        const airdropId = 'HUMA';
        try {
            const response = await fetch(`https://mainnet.airdrop.huma.finance/wallets/${walletAddress}`);
            if (!response.ok) {
                throw new Error(`Error fetching airdrop info: ${response.statusText}`);
            }
            const data: any = await response.json();

            if (data?.amountUnlocked === undefined) {
                return undefined;
            }

            const tokensToClaim = (data?.amountUnlocked || 0) / (10 ** 5);
            // const tokensClaimed = (data?.amountLocked || 0) / (10 ** 5);
            return { walletAddress, tokensToClaim };
        } catch (error) {
            console.error(`Error fetching ${airdropId} airdrop info:`, error);
        }
        return undefined;
    }

}