import Mixpanel from 'mixpanel';
import { Environment } from '../models/types';
import { IUser } from '../entities/users/User';
import { LogManager } from './LogManager';

export class MixpanelManager {

    static mixpanel: Mixpanel.Mixpanel;

    static async init() {
        this.mixpanel = Mixpanel.init(process.env.MIXPANEL_TOKEN!);
    }

    static async track(event: string, profileId: string, properties: any, ipAddress?: string) {
        if (this.mixpanel) {
            properties['distinct_id'] = profileId;
            properties['ip'] = ipAddress;

            if (process.env.ENVIRONMENT == Environment.DEVELOPMENT) {
                LogManager.log('Mixpanel track', event, properties);
            }
            this.mixpanel.track(event, properties);
        }
    }

    static async trackError(profileId: string | undefined, properties: any, ipAddress?: string) {
        if (this.mixpanel) {
            properties['distinct_id'] = profileId;
            properties['ip'] = ipAddress;

            if (process.env.ENVIRONMENT == Environment.DEVELOPMENT) {
                LogManager.log('Mixpanel track', 'Error', properties);
            }
            this.mixpanel.track('Error', properties);
        }
    }

    static async updateProfile(user: IUser, ipAddress: string | undefined) {
        let fullName = user.telegram ? `${user.telegram.first_name} ${user.telegram.last_name}` : undefined;
        if (fullName) { fullName = fullName.trim(); }

        let name = user.telegram ? user.telegram.username : undefined;
        if (name) { name = name.trim(); }

        if (this.mixpanel) {
            const properties = {
                $full_name: fullName,
                $name: name,
                $email: user.email,
                $created: (user.createdAt!).toISOString(),
                referral_code: user.referralCode,
            }

            this.mixpanel.people.set(user.id, properties, { $ip: ipAddress });
        }
    }

}