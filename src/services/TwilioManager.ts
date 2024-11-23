import twilio from 'twilio';
import { TwilioLog } from '../entities/logs/TwilioLog';

export enum TwilioVerifyChannel {
    EMAIL = 'email',
}

export class TwilioManager {

    static async sendVerifyRequest(to: string, channel: TwilioVerifyChannel = TwilioVerifyChannel.EMAIL) {
        console.log('TwilioManager', 'sendVerifyRequest', to);

        try {
            const accountSid = process.env.TWILIO_ACCOUNT_SID!;
            const authToken = process.env.TWILIO_AUTH_TOKEN!;
            const verificationSid = process.env.TWILIO_VERIFICATION_SID!
            const client = twilio(accountSid, authToken);

            const response = await client.verify.v2.services(verificationSid)
                    .verifications
                    .create({to: to, channel: channel});

            console.log('Twilio response:', response);

            const log = new TwilioLog();
            log.request = `sendVerifyRequest ${channel}`;
            log.email = to;
            log.response = JSON.stringify(response);
            log.createdAt = new Date();
            log.save();
        }
        catch (err){
            console.error('TwilioManager', 'sendVerifyRequest', err);
        }
    }

    static async verify(to: string, code: string, channel: TwilioVerifyChannel = TwilioVerifyChannel.EMAIL): Promise<boolean> {
        console.log('TwilioManager', 'verify', to, code);

        try {
            const accountSid = process.env.TWILIO_ACCOUNT_SID!;
            const authToken = process.env.TWILIO_AUTH_TOKEN!;
            const verificationSid = process.env.TWILIO_VERIFICATION_SID!
            const client = twilio(accountSid, authToken);

            const response = await client.verify.v2.services(verificationSid)
                .verificationChecks
                .create({to: to, code: code})

            console.log('Twilio response:', response);

            const log = new TwilioLog();
            log.request = `verify ${channel}`;
            log.email = to;
            log.response = JSON.stringify(response);
            log.createdAt = new Date();
            log.save();

            return response.valid;
        }
        catch (err){
            console.error('TwilioManager', 'verify', err);
        }
        
        return false;
    }

}