import { Config, IConfig } from "../entities/Config";

export class ConfigManager {

    static async getConfig(): Promise<IConfig> {
        const config = await Config.findOne({});

        if (!config) {
            const newConfig = new Config();
            newConfig.isRefPayoutsEnabled = true;
            await newConfig.save();
            return newConfig;
        }

        return config;
    }

    static async updateConfig(config: Partial<IConfig>): Promise<IConfig> {
        const updatedConfig = await Config.findOneAndUpdate({}, { $set: config }, { new: true });

        if (!updatedConfig) {
            throw new Error('Failed to update config');
        }

        return updatedConfig;
    }

}