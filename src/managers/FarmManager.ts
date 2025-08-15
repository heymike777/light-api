import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Farm, FarmStatus, IFarm } from "../entities/Farm";
import { IUserTraderProfile, UserTraderProfile } from "../entities/users/TraderProfile";
import { User } from "../entities/users/User";
import { Helpers } from "../services/helpers/Helpers";
import { SolanaManager } from "../services/solana/SolanaManager";
import { BotManager } from "./bot/BotManager";
import { SwapManager } from "./SwapManager";
import { IMint, ISwap } from "../entities/payments/Swap";
import { kSolAddress } from "../services/solana/Constants";
import { BN } from "bn.js";

export enum FarmPauseReason {
    NO_SOL = 'NO_SOL',
    MULTIPLE_FAILED_TXS = 'MULTIPLE_FAILED_TXS',
}

export class FarmManager {

    static kMinSolAmount = 0.01;
    static kMinSolLamports = this.kMinSolAmount * LAMPORTS_PER_SOL;

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
            // if SOL balance is less than 0.01 SOL - pause the farm
            await this.pauseFarm(farm, FarmPauseReason.NO_SOL, true);
            return;
        }

        const tokenA = farm.pools[0].solBased ? kSolAddress : farm.pools[0].tokenA;
        const tokenB = farm.pools[0].tokenB;
        const poolId = farm.pools[0].solBased ? undefined : farm.pools[0].address;

        if (tokenA == tokenB){
            console.log('FarmManager.makeSwap', 'farm', farm.id, 'tokenA == tokenB. Skipping the swap.');
            return;
        }

        const tokenBalance1 = tokenA == kSolAddress ? solBalance : await SolanaManager.getWalletTokenBalance(farm.chain, walletAddress, tokenA);
        const tokenBalance2 = tokenB == kSolAddress ? solBalance : await SolanaManager.getWalletTokenBalance(farm.chain, walletAddress, tokenB);

        let shouldPauseFarm = false;
        if (tokenA == kSolAddress && tokenBalance1.uiAmount <= 0.03 && tokenBalance2.uiAmount <= 0.01){
            console.log('FarmManager.makeSwap', 'farm', farm.id, 'shouldPauseFarm because of SOL balance (1)');
            shouldPauseFarm = true;
        }
        else if (tokenB == kSolAddress && tokenBalance2.uiAmount <= 0.03 && tokenBalance1.uiAmount <= 0.01){
            console.log('FarmManager.makeSwap', 'farm', farm.id, 'shouldPauseFarm because of SOL balance (2)');
            shouldPauseFarm = true;
        }
        else if (tokenA!=kSolAddress && tokenB!=kSolAddress && tokenBalance1.uiAmount <= 0.01 && tokenBalance2.uiAmount <= 0.01){
            console.log('FarmManager.makeSwap', 'farm', farm.id, 'shouldPauseFarm because of token balances (3)');
            shouldPauseFarm = true;
        }
        if (shouldPauseFarm){
            console.log('FarmManager.makeSwap', 'farm', farm.id, 'shouldPauseFarm', shouldPauseFarm);
            await this.pauseFarm(farm, FarmPauseReason.NO_SOL, true);
            return;
        }

        if (buyOrSell === 'buy' && farm.progress?.buysInARow && farm.progress.buysInARow >= farm.progress.maxBuysInARow){
            buyOrSell = 'sell';
        }

        const user = await User.findById(farm.userId);
        if (!user){
            console.log('FarmManager.makeSwap', 'farm', farm.id, 'user not found');
            return;
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
        
        if (buyOrSell === 'buy'){
            console.log('FarmManager.makeSwap', 'farm', farm.id, 'making BUY swap');
            console.log('FarmManager.makeSwap', 'farm', farm.id, 'tokenBalance1', tokenBalance1.uiAmount, 'tokenBalance2', tokenBalance2.uiAmount);

            let amountMin = tokenBalance1.amount.muln(0.2);
            let amountMax = tokenBalance1.amount;
            if (tokenA == kSolAddress){
                if (amountMin.lt(new BN(this.kMinSolLamports))){
                    amountMin = new BN(this.kMinSolAmount * LAMPORTS_PER_SOL);
                }

                if (amountMax.gt(tokenBalance1.amount.subn(this.kMinSolLamports))){
                    amountMax = tokenBalance1.amount.subn(this.kMinSolLamports);
                }
            }
            
            if (amountMin.gt(amountMax)){
                console.log('FarmManager.makeSwap', 'farm', farm.id, 'amountMin is greater than amountMax. Skipping the swap.', 'amountMin', amountMin.toString(), 'amountMax', amountMax.toString());
                return;
            }
            if (amountMin.eq(amountMax) && amountMin.lte(new BN(0))){
                console.log('FarmManager.makeSwap', 'farm', farm.id, 'amountMin is equal to amountMax and is less than or equal to 0. Skipping the swap.', 'amountMin', amountMin.toString(), 'amountMax', amountMax.toString());
                return;
            }

            const amount = +Helpers.bnToUiAmount(Helpers.getRandomBn(amountMin, amountMax), tokenBalance1.decimals || 0);
            console.log('FarmManager.makeSwap', 'farm', farm.id, 'amountMin', amountMin.toString(), 'amountMax', amountMax.toString(), 'amount', amount);
            if (amount <= 0){
                console.log('FarmManager.makeSwap', 'farm', farm.id, 'amount is zero or negative. Skipping the swap.');
                return;
            }
            console.log('FarmManager.makeSwap', 'farm', farm.id, 'swap amount', amount);
            const from: IMint = { mint: tokenA, decimals: tokenBalance1.decimals };
            const to: IMint = { mint: tokenB, decimals: tokenBalance2.decimals };
            const { signature, swap } = await SwapManager.initiateBuy(user, farm.chain, farm.traderProfileId, from, to, amount, farm.id, poolId);

            console.log('FarmManager.makeSwap', 'farm', farm.id, 'swap.value?.usd', swap.value?.usd);
            console.log('FarmManager.makeSwap', 'farm', farm.id, 'signature', signature);

            await this.swapStarted(swap);
        }
        else {
            console.log('FarmManager.makeSwap', 'farm', farm.id, 'making SELL swap');

            //TODO: hardcoded for only one pool PER BOT for now

            const from: IMint = { mint: tokenB, decimals: tokenBalance2.decimals };
            const to: IMint = { mint: tokenA, decimals: tokenBalance1.decimals };
            const { signature, swap } = await SwapManager.initiateSell(user, farm.chain, farm.traderProfileId, from, to, 100, farm.id, poolId);

            console.log('FarmManager.makeSwap', 'farm', farm.id, 'swap.value?.usd', swap.value?.usd);
            console.log('FarmManager.makeSwap', 'farm', farm.id, 'signature', signature);

            await this.swapStarted(swap);
        }
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
                message += `\nReason: Not enough SOL or tokens in the wallet.`;
                if (!farm.mint){
                    message += `\nSince you are making a bot for a specific pool, make sure you have at least one of the tokens in the wallet, and also enough SOL to cover gas fees.`;
                }
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

        let message = `🤖 Bot is completed.`;
        if (tradingProfile?.encryptedWallet?.publicKey) {
            message += `\nWallet: <code>${tradingProfile.encryptedWallet.publicKey}</code>`;
        }
        message += `\nTotal volume: $${farm.progress?.currentVolume.toFixed(2)}`;

        BotManager.sendMessage({ 
            id: `user_${user.id}_farm_${farm.id}_${Helpers.makeid(12)}`,
            userId: user.id,
            chatId: user.telegram?.id, 
            text: message, 
        }, 5);
    }
}