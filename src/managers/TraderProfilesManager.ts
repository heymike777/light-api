import { IUserTraderProfile, UserTraderProfile } from "../entities/users/TraderProfile";
import { IUser } from "../entities/users/User";
import { Wallet } from "../entities/Wallet";
import { BadRequestError } from "../errors/BadRequestError";
import { PremiumError } from "../errors/PremiumError";
import { PortfolioAsset } from "../models/types";
import { Helpers } from "../services/helpers/Helpers";
import { kSolAddress } from "../services/solana/Constants";
import { SolanaManager } from "../services/solana/SolanaManager";
import { Chain, Priority, WalletModel } from "../services/solana/types";
import { LogManager } from "./LogManager";
import { SubscriptionManager } from "./SubscriptionManager";
import { SwapManager } from "./SwapManager";
import { TokenManager } from "./TokenManager";
import { WalletManager } from "./WalletManager";
import fs from 'fs';

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

    static async getUserDefaultTraderProfile(userId: string): Promise<IUserTraderProfile | undefined> {
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

    static async createTraderProfile(user: IUser, engineId: string, title: string, priority: Priority, defaultAmount?: number, slippage?: number, ipAddress?: string): Promise<IUserTraderProfile> {
        const maxNumberOfTraderProfiles = user.maxNumberOfTraderProfiles || SubscriptionManager.getMaxNumberOfTraderProfiles();
        const nativeProfilesCount = user.traderProfiles ? user.traderProfiles.filter(p => p.engineId == SwapManager.kNativeEngineId).length : 0;

        if (nativeProfilesCount >= maxNumberOfTraderProfiles){
            throw new PremiumError("Max number of traders reached. Upgrade your account to create more traders.");
        }

        let wallet: WalletModel | undefined;
        if (engineId == SwapManager.kNativeEngineId){
            wallet = SolanaManager.createWallet();

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
            throw new BadRequestError("Trader not found");
        }

        if (traderProfile.userId != userId){
            throw new BadRequestError("Trader not found");
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

    static async getPortfolio(chain: Chain, traderProfile?: IUserTraderProfile): Promise<{ values?: { walletAddress?: string, totalPrice: number, pnl?: number }, assets: PortfolioAsset[], warning?: { message: string, backgroundColor: string, textColor: string } }> {
        if (!traderProfile){
            return { values: undefined, assets: [], warning: undefined };
        }

        const values: {
            walletAddress?: string,
            totalPrice: number,
            pnl?: number,
        } = {
            walletAddress: traderProfile?.wallet?.publicKey, 
            totalPrice: 0, 
        };

        const assets: PortfolioAsset[] = [];
        if (traderProfile){
            let walletAddress = traderProfile.wallet?.publicKey;
            if (!walletAddress){
                // That's impossible. All "light" traders should have a wallet
                throw new BadRequestError('Wallet not found');
            }

            // walletAddress = '9Xt9Zj9HoAh13MpoB6hmY9UZz37L4Jabtyn8zE7AAsL';//TODO: remove test wallet
            const tmpAssets = await SolanaManager.getAssetsByOwner(walletAddress);

            const mints = tmpAssets.map(a => a.address);
            const tokens = await TokenManager.getTokens(chain, mints);
            let totalPrice = 0;

            for (const tmpAsset of tmpAssets) {
                const token = tokens.find(t => t.address == tmpAsset.address);
                LogManager.log('!token', token);

                const pAsset: PortfolioAsset = tmpAsset;
                pAsset.isVerified = token?.isVerified || false;
                pAsset.isTradable = TokenManager.isTokenTradable(token?.address);
                pAsset.tags = token?.tags || undefined;
                pAsset.tagsList = token?.tagsList || [];

                // const rand = Helpers.getRandomInt(1, 3);
                // pAsset.pnl = rand == 1 ? 1234 : (rand == 2 ? -1234 : undefined);
                assets.push(pAsset);

                totalPrice += pAsset.priceInfo?.totalPrice || 0;
            }

            values.totalPrice = Math.round(totalPrice * 100) / 100;

            //TODO: calc PnL for this wallet (existing and OLD, which I've already sold)
            // values.pnl = 1000; 

            //TODO: calc PnL for each token in this wallet
        }

        let warning: {
            message: string,
            backgroundColor: string,
            textColor: string,
        } | undefined = undefined;

        const solAsset = assets.find(a => a.address == kSolAddress && a.symbol == 'SOL');

        if (!solAsset || solAsset.uiAmount < 0.01){
            warning = {
                message: 'Send some SOL to your trading wallet to ape into memes and cover gas fee.',
                backgroundColor: '#DC3545',
                textColor: '#FFFFFF',
            }
        }

        return { values, assets, warning };
    }

}