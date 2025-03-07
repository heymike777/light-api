import { IUserTraderProfile, UserTraderProfile } from "../entities/users/TraderProfile";
import { IUser } from "../entities/users/User";
import { Wallet } from "../entities/Wallet";
import { BadRequestError } from "../errors/BadRequestError";
import { PremiumError } from "../errors/PremiumError";
import { SolanaManager } from "../services/solana/SolanaManager";
import { WalletModel } from "../services/solana/types";
import { SubscriptionManager } from "./SubscriptionManager";
import { SwapManager } from "./SwapManager";
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

    static async getAllTraderProfiles(): Promise<IUserTraderProfile[]> {
        const profiles = await UserTraderProfile.find({ engineId: SwapManager.kNativeEngineId, active: true });
        return profiles;
    }

    static async findById(id: string): Promise<IUserTraderProfile | undefined> {
        const profile = await UserTraderProfile.findById(id);
        return (profile && profile.active) ? profile : undefined;
    }

    static async createTraderProfile(user: IUser, engineId: string, title: string, defaultAmount?: number, slippage?: number, ipAddress?: string): Promise<IUserTraderProfile> {
        const maxNumberOfTraderProfiles = user.maxNumberOfTraderProfiles || SubscriptionManager.getMaxNumberOfTraderProfiles();
        const nativeProfilesCount = user.traderProfiles ? user.traderProfiles.filter(p => p.engineId == SwapManager.kNativeEngineId).length : 0;

        if (nativeProfilesCount >= maxNumberOfTraderProfiles){
            throw new PremiumError("Max number of trader profiles reached. Upgrade your account to create more trader profiles.");
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
        traderProfile.slippage = slippage;
        traderProfile.createdAt = new Date();
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
        console.log('deactivateTraderProfile', 'traderProfile:', traderProfile);
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

        console.log('deactivateTraderProfile', 'traderProfile.default:', traderProfile.default);

        if (traderProfile.default){
            // if the deleted profile was default, make the first profile default
            const res = await UserTraderProfile.updateOne({ userId: userId, active: true, engineId: SwapManager.kNativeEngineId }, { $set: { default: true } });            
            console.log('deactivateTraderProfile', 'updateOne res:', res);

            const traderProfiles = await TraderProfilesManager.getUserTraderProfiles(userId);
            console.log('deactivateTraderProfile', 'traderProfiles:', traderProfiles);
        }
    }

}