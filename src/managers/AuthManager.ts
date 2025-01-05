import jwt from 'jsonwebtoken';
import { Auth, IAuth } from '../entities/Auth';
import { BadRequestError } from '../errors/BadRequestError';
import { Helpers } from '../services/helpers/Helpers';
import { IUser, User } from '../entities/users/User';
import { AccessToken } from '../models/AccessToken';
import { BrevoManager } from './BrevoManager';
import { SystemNotificationsManager } from './SytemNotificationsManager';
import { TwilioManager } from '../services/TwilioManager';
import { UserManager } from './UserManager';
import { MixpanelManager } from './MixpanelManager';
import { StringSchemaDefinition } from 'mongoose';

export enum VerificationService {
    TWILIO = 'TWILIO',
    BREVO = 'BREVO'
}

export class AuthManager {
    static kVerificationService: VerificationService = process.env.VERIFICATION_SERVICE! as VerificationService;

    static async createAuth(email: string): Promise<string> {
        const requestsCount = await Auth.countDocuments({ email, createdAt: { $gte: new Date(Date.now() - 1000 * 60 * 60) } });
        if (requestsCount >= 5) {
            throw new BadRequestError('Too many requests. Try again later.', 'email');
        }

        await BrevoManager.createContact({email}, [BrevoManager.allUsersListId]);

        let verificationService = this.kVerificationService;

        if (email == 'test@heynova.xyz'){
            verificationService = VerificationService.BREVO;
        }

        const request = new Auth();
        request.verificationService = verificationService;
        request.email = email;
        request.createdAt = new Date();
        request.tries = 0;

        if (verificationService == VerificationService.BREVO){
            request.code = email=='test@heynova.xyz' ? '111111' : this.generateCode();
            request.lastSentAt = new Date();
        }

        await request.save();


        // send email
        if (verificationService == VerificationService.TWILIO){
            await TwilioManager.sendVerifyRequest(request.email);
        }
        else if (verificationService == VerificationService.BREVO){            
            await BrevoManager.sendAuthTransactionalEmail(request.email, request.code);
        }
        else {
            throw new BadRequestError('Invalid verification service');
        }

        return request.id;
    }

    static async resendAuthRequest(requestId: string): Promise<void> {        
        const request = await Auth.findById(requestId);

        if (!request){
            throw new BadRequestError('Invalid request', 'requestId');
        }

        if (request.verificationService == VerificationService.TWILIO){
            await TwilioManager.sendVerifyRequest(request.email);
        }
        else if (request.verificationService == VerificationService.BREVO){
            if (request.createdAt!.getTime() < Date.now() - 1000 * 60 * 10) { // request is valid for 10 minutes
                throw new BadRequestError('Invalid request', 'requestId');
            }
            if (request.tries >= 5) {
                throw new BadRequestError('Too many wrong tries.', 'requestId');
            }
            if (request.lastSentAt.getTime() > Date.now() - 1000 * 60) {
                throw new BadRequestError('Try again in a minute', 'requestId');
            }
    
            await Auth.updateOne({ _id: requestId }, { lastSentAt: new Date()  });

            await BrevoManager.sendAuthTransactionalEmail(request.email, request.code);
        }
        else {
            throw new BadRequestError('Invalid verification service');
        }
    }

    static async validate(requestId: string, code: string): Promise<IAuth> {        
        const request = await Auth.findByIdAndUpdate(requestId, { $inc: { tries: 1 } }, { new: true });

        if (!request){
            throw new BadRequestError('Invalid request', 'requestId');
        }

        if (request.verificationService == VerificationService.TWILIO){
            const valid = await TwilioManager.verify(request.email, code);
            if (!valid){
                throw new BadRequestError('Invalid code', 'code');
            }
            await Auth.updateOne({ _id: requestId }, { success: true });
        }
        else if (request.verificationService == VerificationService.BREVO){
            if (request.createdAt!.getTime() < Date.now() - 1000 * 60 * 10) { // request is valid for 10 minutes
                throw new BadRequestError('Invalid request', 'requestId');
            }
            if (request.tries >= 5) {
                throw new BadRequestError('Too many wrong tries.', 'requestId');
            }
            if (request.success){
                throw new BadRequestError('Already validated', 'requestId');
            }
            if (request.code != code){
                throw new BadRequestError('Invalid code', 'code');
            }

            await Auth.updateOne({ _id: requestId }, { success: true });
        }

        return request;
    }

    static generateCode(): string {
        return Helpers.getRandomInt(100000, 999999).toString();
    }

    static createAccessToken(user: IUser): AccessToken {
        let accessToken = new AccessToken(user.id);
        return accessToken;
    }

    static createJwtAccessToken(accessToken: AccessToken): string {
        const jwtToken = jwt.sign({accessToken}, process.env.JWT_SECRET_KEY!);
        return jwtToken;
    }

    static async findOrCreateUser(email: string): Promise<IUser> {
        const existingUser = await User.findOne({ email });
        if (existingUser){
            await UserManager.fillUserWithData(existingUser);
            return existingUser;
        }

        const user = new User();
        user.email = email;
        user.createdAt = new Date();
        await user.save();

        MixpanelManager.updateProfile(user, undefined);
    
        SystemNotificationsManager.sendSystemMessage(`New user: ${email}`);

        return user;
    }

}