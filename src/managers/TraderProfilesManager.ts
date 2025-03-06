import { IUserTraderProfile, UserTraderProfile } from "../entities/users/TraderProfile";
import { SwapManager } from "./SwapManager";

export class TraderProfilesManager {

    static async getUserTraderProfiles(userId: string, engineId?: string): Promise<IUserTraderProfile[]> {
        let profiles = await UserTraderProfile.find({ userId: userId, active: true });

        if (engineId){
            profiles = profiles.filter(p => p.engineId === engineId);
        }

        return profiles;
    }

    static async getAllTraderProfiles(): Promise<IUserTraderProfile[]> {
        const profiles = await UserTraderProfile.find({ engineId: SwapManager.kNaviteEngineId, active: true });
        return profiles;
    }

    static async findById(id: string): Promise<IUserTraderProfile | undefined> {
        const profile = await UserTraderProfile.findById(id);
        return (profile && profile.active) ? profile : undefined;
    }

}