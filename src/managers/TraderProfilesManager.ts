import { IUserTraderProfile, UserTraderProfile } from "../entities/users/TraderProfile";

export class TraderProfilesManager {

    static async getUserTraderProfiles(userId: string): Promise<IUserTraderProfile[]> {
        const profiles = await UserTraderProfile.find({ userId: userId, active: true });
        return profiles;
    }

    static async findById(id: string): Promise<IUserTraderProfile | undefined> {
        const profile = await UserTraderProfile.findById(id);
        return (profile && profile.active) ? profile : undefined;
    }

}