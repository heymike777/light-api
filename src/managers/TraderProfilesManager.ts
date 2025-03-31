import { BN } from "bn.js";
import { SwapDex } from "../entities/payments/Swap";
import { PreWallet } from "../entities/PreWallet";
import { LpMint } from "../entities/tokens/LpMint";
import { TokenPair } from "../entities/tokens/TokenPair";
import { IUserTraderProfile, UserTraderProfile } from "../entities/users/TraderProfile";
import { IUser } from "../entities/users/User";
import { Wallet } from "../entities/Wallet";
import { BadRequestError } from "../errors/BadRequestError";
import { PremiumError } from "../errors/PremiumError";
import { PortfolioAsset } from "../models/types";
import { Helpers } from "../services/helpers/Helpers";
import { kSolAddress } from "../services/solana/Constants";
import { newConnectionByChain } from "../services/solana/lib/solana";
import { SolanaManager } from "../services/solana/SolanaManager";
import { Chain, Priority, WalletModel } from "../services/solana/types";
import { LogManager } from "./LogManager";
import { SubscriptionManager } from "./SubscriptionManager";
import { SwapManager } from "./SwapManager";
import { TokenManager } from "./TokenManager";
import { WalletManager } from "./WalletManager";
import fs from 'fs';
import { RaydiumManager } from "../services/solana/RaydiumManager";

export class TraderProfilesManager {

    static async getUserTraderProfiles(userId: string, engineId?: string): Promise<IUserTraderProfile[]> {
        let profiles = await UserTraderProfile.find({ userId: userId, active: true });

        if (engineId){
            profiles = profiles.filter(p => p.engineId === engineId);
        }

        return profiles;
    }

    static async getUserTraderProfile(userId: string, profileId: string): Promise<IUserTraderProfile | undefined> {
        let profile = await UserTraderProfile.findById(profileId);

        if (profile && profile.userId == userId && profile.active){
            return profile;
        }
    }

    static async getUserDefaultTraderProfile(userId?: string): Promise<IUserTraderProfile | undefined> {
        if (!userId){ return; }
        
        const profiles = await this.getUserTraderProfiles(userId, SwapManager.kNativeEngineId);
        if (profiles.length == 0){
            return undefined;
        }

        const profile = profiles.find(p => p.userId == userId && p.default);
        return profile || profiles[0];
    }

    static async getAllTraderProfiles(): Promise<IUserTraderProfile[]> {
        const profiles = await UserTraderProfile.find({ engineId: SwapManager.kNativeEngineId, active: true });
        return profiles;
    }

    static async findById(id: string): Promise<IUserTraderProfile | undefined> {
        const profile = await UserTraderProfile.findById(id);
        return (profile && profile.active) ? profile : undefined;
    }

    static async createTraderProfile(user: IUser, engineId: string, title: string, priority: Priority, defaultAmount?: number, slippage?: number, ipAddress?: string, importedWallet?: WalletModel): Promise<IUserTraderProfile> {
        const maxNumberOfTraderProfiles = user.maxNumberOfTraderProfiles || SubscriptionManager.getMaxNumberOfTraderProfiles();
        const nativeProfilesCount = user.traderProfiles ? user.traderProfiles.filter(p => p.engineId == SwapManager.kNativeEngineId).length : 0;

        if (nativeProfilesCount >= maxNumberOfTraderProfiles){
            throw new PremiumError("Max number of trader profiles reached. Upgrade your account to create more trader profiles.");
        }

        let wallet: WalletModel | undefined = importedWallet;
        if (importedWallet) {
            //TODO: check if the wallet is already used
            const existing = await UserTraderProfile.findOne({ userId: user.id, "wallet.publicKey": importedWallet.publicKey, active: true });
            if (existing){
                throw new BadRequestError("You already have trader profile with this wallet");
            }
        }
        if (!wallet && engineId == SwapManager.kNativeEngineId){
            const niceWallet = await PreWallet.findOneAndUpdate({ isUsed: false }, { $set: { isUsed: true } });
            if (niceWallet){
                wallet = { publicKey: niceWallet.publicKey, privateKey: niceWallet.privateKey };
            }
            else {
                wallet = SolanaManager.createWallet();
            }

            fs.appendFileSync('wallets.txt', `UserId: ${user.id}, PublicKey: ${wallet.publicKey}, PrivateKey: ${wallet.privateKey}\n`);
        }

        const traderProfile = new UserTraderProfile();
        traderProfile.userId = user.id;
        traderProfile.engineId = engineId;
        traderProfile.title = title;
        traderProfile.defaultAmount = defaultAmount;
        traderProfile.buySlippage = slippage;
        traderProfile.createdAt = new Date();
        traderProfile.priorityFee = priority;
        traderProfile.active = true;
        traderProfile.default = (!user.traderProfiles || user.traderProfiles.length == 0); // default=true for the first profile
        traderProfile.wallet = wallet;
        await traderProfile.save();

        if (traderProfile.wallet){
            await WalletManager.addWallet(-1, user, traderProfile.wallet.publicKey, traderProfile.title, ipAddress, traderProfile.id);
        }

        return traderProfile;
    }

    static async deactivateTraderProfile(traderProfileId: string, userId: string, ipAddress?: string) {
        const traderProfile = await TraderProfilesManager.findById(traderProfileId);
        LogManager.log('deactivateTraderProfile', 'traderProfile:', traderProfile);
        if (!traderProfile){
            throw new BadRequestError("Trader profile not found");
        }

        if (traderProfile.userId != userId){
            throw new BadRequestError("Trader profile not found");
        }

        traderProfile.active = false;
        await traderProfile.save();

        if (traderProfile.wallet){
            const traderProfileWallet = await Wallet.findOne({ traderProfileId: traderProfileId });
            if (traderProfileWallet){
                await WalletManager.removeWallet(traderProfileWallet, ipAddress);    
            }
        }

        LogManager.log('deactivateTraderProfile', 'traderProfile.default:', traderProfile.default);

        if (traderProfile.default){
            // if the deleted profile was default, make the first profile default
            const res = await UserTraderProfile.updateOne({ userId: userId, active: true, engineId: SwapManager.kNativeEngineId }, { $set: { default: true } });            
            LogManager.log('deactivateTraderProfile', 'updateOne res:', res);

            const traderProfiles = await TraderProfilesManager.getUserTraderProfiles(userId);
            LogManager.log('deactivateTraderProfile', 'traderProfiles:', traderProfiles);
        }
    }

    static async fetchTokenLpMintBalance(chain: Chain, dex: SwapDex, mint: string, walletAddress: string) {
        const lpMint = await LpMint.findOne({ chain, dex, $or: [{ token1: mint }, { token2: mint }] });
        if (!lpMint){
            return;
        }

        //TODO: this method could be optimized. I think I can replace 
        //getWalletTokenBalance + updateTokenPairLiquidity + getAmmPoolInfo with one call getMultipleParsedAccount

        const lpMintAddress = lpMint.lpMint;
        const connection = newConnectionByChain(chain);
        const lpTokenBalance = await SolanaManager.getWalletTokenBalance(connection, walletAddress, lpMintAddress);

        const pair = await TokenPair.findOne({ chain, pairAddress: lpMint.pairAddress });
        if (!pair){
            return;
        }

        await TokenManager.updateTokenPairLiquidity(pair);
        let lpReserve = new BN(0);
        if (dex == SwapDex.RAYDIUM_AMM){
            const poolInfo = await RaydiumManager.getAmmPoolInfo(Chain.SOLANA, lpMint.pairAddress);
            if (poolInfo){
                lpReserve = poolInfo.lpReserve;
            }
        }

        // const lpReserveDecimals = lpTokenBalance?.decimals || 0;

        // WORKING VERSION, but using uiAmounts
        // const numerator = lpTokenBalance.uiAmount  * pair.liquidity.token1.uiAmount * (10 ** lpReserveDecimals)
        // const denominator = lpReserve.toNumber();
        // const myTokenAmount1 = numerator / denominator;
        // const myTokenAmount2 = myTokenAmount1 * pair.liquidity.token2.uiAmount / pair.liquidity.token1.uiAmount;

        const numerator1 = new BN(lpTokenBalance.amount).mul(new BN(pair.liquidity.token1.amount));
        const denominator1 = lpReserve.mul(new BN(10 ** pair.liquidity.token1.decimals));
        const myTokenAmount1 = Helpers.bnDivBnWithDecimals(numerator1, denominator1, 6);

        const numerator2 = numerator1.mul(new BN(pair.liquidity.token2.amount)).mul(new BN(10 ** pair.liquidity.token1.decimals));
        const denominator2 = denominator1.mul(new BN(pair.liquidity.token1.amount)).mul(new BN(10 ** pair.liquidity.token2.decimals));
        const myTokenAmount2 = Helpers.bnDivBnWithDecimals(numerator2, denominator2, 6);

        const balances = [
            {
                mint: pair.token1,
                uiAmount: myTokenAmount1,
            },
            {
                mint: pair.token2,
                uiAmount: myTokenAmount2,
            },
        ];

        return {
            balances
        }
    }

}