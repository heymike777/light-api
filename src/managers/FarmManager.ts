import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Farm, FarmStatus, IFarm } from "../entities/Farm";
import { IUserTraderProfile, UserTraderProfile } from "../entities/users/TraderProfile";
import { User } from "../entities/users/User";
import { Helpers } from "../services/helpers/Helpers";
import { SolanaManager } from "../services/solana/SolanaManager";
import { BotManager } from "./bot/BotManager";
import { SwapManager } from "./SwapManager";
import { ISwap } from "../entities/payments/Swap";

export enum FarmPauseReason {
    NO_SOL = 'NO_SOL',
    MULTIPLE_FAILED_TXS = 'MULTIPLE_FAILED_TXS',
}

export class FarmManager {

    static kMinSolAmount = 0.01;

    static async tick() {
        console.log('FarmManager.tick');

        const farms = await this.getActiveFarms();
        for (const farm of farms) {
            console.log('FarmManager.tick', 'farm', farm.id);
            if (!farm.lastSwapAt || (farm.lastSwapAt.getTime() + farm.frequency * 1000) <= Date.now()) {
                await this.makeSwap(farm);
            }
            else {
                console.log('FarmManager.tick', 'farm', farm.id, 'skipping. Too early to make swap.');
            }
        }

    }

    static async getActiveFarms(): Promise<IFarm[]> {
        let farms = await Farm.find({ status: FarmStatus.ACTIVE });
        farms = farms.sort((a, b) => {
            if (a.lastSwapAt && b.lastSwapAt) {
                return a.lastSwapAt.getTime() - b.lastSwapAt.getTime();
            }
            return 0;
        });
        return farms;
    }

    static async makeSwap(farm: IFarm) {
        const currentVolume = farm.progress?.currentVolume || 0;
        const processingVolume = farm.progress?.processingVolume || 0;
        if (currentVolume + processingVolume > farm.volume){
            console.log('FarmManager.makeSwap', 'farm', farm.id, 'skipping. Volume limit reached. Waiting for swaps confirmations to complete the farm.');
            return;
        }

        console.log('FarmManager.makeSwap', 'farm', farm.id);
        farm.lastSwapAt = new Date();
        farm.progress = {
            currentVolume: farm.progress?.currentVolume || 0,
            processingVolume: farm.progress?.processingVolume || 0,
            buysInARow: farm.progress?.buysInARow || 0,
            maxBuysInARow: farm.progress?.maxBuysInARow || 0,
        };

        let buyOrSell: 'buy' | 'sell' = 'buy';

        const traderProfile = await this.getTraderProfile(farm);
        if (!traderProfile){
            console.log('FarmManager.makeSwap', 'farm', farm.id, 'no trader profile');
            return;
        }

        const walletAddress = traderProfile.encryptedWallet?.publicKey;
        if (!walletAddress){
            console.log('FarmManager.makeSwap', 'farm', farm.id, 'no wallet address');
            return;
        }

        const solBalance = await SolanaManager.getWalletSolBalance(farm.chain, walletAddress);
        if (!solBalance){
            console.log('FarmManager.makeSwap', 'farm', farm.id, 'solBalance is undefined. Skipping the swap.');
            return;
        }
        if (solBalance.uiAmount < this.kMinSolAmount){
            //TODO: hardcoded for only one pool per swap for now
            const tokenBalance = await SolanaManager.getWalletTokenBalance(farm.chain, walletAddress, farm.pools[0].tokenB);
            if  (tokenBalance.uiAmount < 0.000001){
                await this.pauseFarm(farm, FarmPauseReason.NO_SOL, true);
                return;
            }
            else {
                // if usdt balance is not zero - make SELL swap
                buyOrSell = 'sell';
            }
        }

        if (buyOrSell === 'buy' && farm.progress?.buysInARow && farm.progress.buysInARow >= farm.progress.maxBuysInARow){
            buyOrSell = 'sell';
        }

        const user = await User.findById(farm.userId);
        if (!user){
            console.log('FarmManager.makeSwap', 'farm', farm.id, 'user not found');
            return;
        }

        if (buyOrSell === 'buy'){
            console.log('FarmManager.makeSwap', 'farm', farm.id, 'making BUY swap');

            // const amountMin = this.kMinSolAmount * LAMPORTS_PER_SOL;
            const amountMin1 = Math.floor(solBalance.amount.toNumber() * 0.2);
            const amountMin2 = this.kMinSolAmount * LAMPORTS_PER_SOL; // 20 SOL is the minimum amount for a buy swap
            const amountMin = Math.max(amountMin1, amountMin2);
            console.log('FarmManager.makeSwap', 'farm', farm.id, 'amountMin1:', amountMin1, 'amountMin2:', amountMin2, 'amountMin:', amountMin);

            const amountMax1 = Math.floor(solBalance.amount.toNumber() * 0.9);
            const amountMax2 = solBalance.amount.toNumber() - 0.01 * LAMPORTS_PER_SOL;
            const amountMax = Math.min(amountMax1, amountMax2);
            console.log('FarmManager.makeSwap', 'farm', farm.id, 'amountMax1:', amountMax1, 'amountMax2:', amountMax2, 'amountMax:', amountMax);
            
            if (amountMin > amountMax){
                console.log('FarmManager.makeSwap', 'farm', farm.id, 'amountMin is greater than amountMax. Skipping the swap.');
                return;
            }
            const amount = Helpers.getRandomInt(amountMin, amountMax) / LAMPORTS_PER_SOL;
            if (amount < 0){
                console.log('FarmManager.makeSwap', 'farm', farm.id, 'amount is negative. Skipping the swap.');
                return;
            }
            console.log('FarmManager.makeSwap', 'farm', farm.id, 'swap amount', amount);
            const mint = farm.pools[0].tokenB;
            const poolId = farm.pools[0].address;
            const { signature, swap } = await SwapManager.initiateBuy(user, farm.chain, farm.traderProfileId, mint, amount, false, farm.id, poolId);

            console.log('FarmManager.makeSwap', 'farm', farm.id, 'swap.value?.usd', swap.value?.usd);
            console.log('FarmManager.makeSwap', 'farm', farm.id, 'signature', signature);

            await this.swapStarted(swap);
        }
        else {
            console.log('FarmManager.makeSwap', 'farm', farm.id, 'making SELL swap');

            //TODO: hardcoded for only one pool per swap for now
            const mint = farm.pools[0].tokenB;
            const poolId = farm.pools[0].address;
            const { signature, swap } = await SwapManager.initiateSell(user, farm.chain, farm.traderProfileId, mint, 100, false, farm.id, poolId);

            console.log('FarmManager.makeSwap', 'farm', farm.id, 'swap.value?.usd', swap.value?.usd);
            console.log('FarmManager.makeSwap', 'farm', farm.id, 'signature', signature);

            await this.swapStarted(swap);
        }

        if (buyOrSell === 'buy') {
            farm.progress.buysInARow++;
        }
        else {
            farm.progress.buysInARow = 0;
            farm.progress.maxBuysInARow = Helpers.getRandomInt(2, 3);
        }

        await Farm.updateOne({ _id: farm.id }, { $set: { 
            lastSwapAt: farm.lastSwapAt, 
            'progress.buysInARow': farm.progress.buysInARow, 
            'progress.maxBuysInARow': farm.progress.maxBuysInARow 
        }});
    }

    private static traderProfilesCache: { [key: string]: { traderProfile: IUserTraderProfile, lastUpdate: Date } } = {};
    static async getTraderProfile(farm: IFarm) {
        if (!farm.traderProfileId){
            return undefined;
        }
        if (this.traderProfilesCache[farm.traderProfileId]){
            if (this.traderProfilesCache[farm.traderProfileId].lastUpdate.getTime() + 60000 > Date.now()){
                return this.traderProfilesCache[farm.traderProfileId].traderProfile;
            }
        }
        const traderProfile = await UserTraderProfile.findOne({ _id: farm.traderProfileId });
        if (traderProfile){
            this.traderProfilesCache[farm.traderProfileId] = { traderProfile, lastUpdate: new Date() };
            return traderProfile;
        }
        return undefined;
    }

    static async swapStarted(swap: ISwap) {
        if (!swap.farmId) return;
        const usdValue = swap.value?.usd || 0;
        if (usdValue > 0){
            await Farm.updateOne(
                { _id: swap.farmId },
                { 
                    $inc: { 
                        'progress.processingVolume': usdValue,
                    },
                }
            );
        }
    }

    static async swapCompleted(swap: ISwap) {
        if (!swap.farmId) return;
        const usdValue = swap.value?.usd || 0;
        if (usdValue > 0){
            const farm = await Farm.findOneAndUpdate(
                { _id: swap.farmId },
                { 
                    $inc: { 
                        'progress.currentVolume': usdValue,
                        'progress.processingVolume': -usdValue,
                    },
                    $set: {
                        'failedSwapsCount': 0,
                    }
                },
                {
                    new: true,
                }
            );

            if (farm && farm.progress?.currentVolume && farm.progress?.currentVolume >= farm.volume){
                await this.completeFarm(farm);
            }
        }
    }

    static async swapFailed(swap: ISwap) {
        if (!swap.farmId) return;
        const usdValue = swap.value?.usd || 0;
        if (usdValue > 0){
            const farm = await Farm.findOneAndUpdate(
                { _id: swap.farmId },
                { 
                    $inc: { 
                        'progress.processingVolume': -usdValue,
                        'failedSwapsCount': 1,
                    },
                },
                {
                    new: true,
                }
            );

            if (farm?.failedSwapsCount && farm.failedSwapsCount >= 10){
                await this.pauseFarm(farm, FarmPauseReason.MULTIPLE_FAILED_TXS, true);
            }
        }
    }

    static async pauseFarm(farm: IFarm, reason: FarmPauseReason, sendMessage: boolean = false) {
        await Farm.updateOne({ _id: farm.id }, { $set: { status: FarmStatus.PAUSED } });

        if (sendMessage){
            const user = await User.findById(farm.userId);
            if (!user){
                console.log('FarmManager.pauseFarm', 'farm', farm.id, 'user not found');
                return;
            }
            else if (!user.telegram?.id){
                console.log('FarmManager.pauseFarm', 'farm', farm.id, 'user has no telegram id');
                return;
            }

            let message = `🔴🔴🔴 Farm is paused.`;
            if (reason === FarmPauseReason.NO_SOL){
                message += `\nReason: Not enough SOL in the wallet.`;
            }
            else if (reason === FarmPauseReason.MULTIPLE_FAILED_TXS){
                message += `\nReason: Multiple failed transactions. We paused the farm to prevent wallet from being drained with gas fees. Make sure your farm is configured correctly, there are no network congestion issues, etc, and try to resume the farm.`;
            }

            BotManager.sendMessage({ 
                id: `user_${user.id}_farm_${farm.id}_${Helpers.makeid(12)}`,
                userId: user.id,
                chatId: user.telegram?.id, 
                text: message, 
            });
        }
    }

    static async completeFarm(farm: IFarm) {
        await Farm.updateOne({ _id: farm.id }, { $set: { status: FarmStatus.COMPLETED } });

        const user = await User.findById(farm.userId);
            if (!user){
                console.log('FarmManager.pauseFarm', 'farm', farm.id, 'user not found');
                return;
            }
            else if (!user.telegram?.id){
                console.log('FarmManager.pauseFarm', 'farm', farm.id, 'user has no telegram id');
                return;
            }

            const tradingProfile = await UserTraderProfile.findById(farm.traderProfileId);

            let message = `⛏️ Farm is completed.`;
            if (tradingProfile?.encryptedWallet?.publicKey) {
                message += `\nWallet: <code>${tradingProfile.encryptedWallet.publicKey}</code>`;
            }
            message += `\nTotal volume: $${farm.progress?.currentVolume.toFixed(2)}`;

            BotManager.sendMessage({ 
                id: `user_${user.id}_farm_${farm.id}_${Helpers.makeid(12)}`,
                userId: user.id,
                chatId: user.telegram?.id, 
                text: message, 
            });
    }
}