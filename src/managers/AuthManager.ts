import jwt from 'jsonwebtoken';
import { Auth, IAuth } from '../entities/Auth';
import { BadRequestError } from '../errors/BadRequestError';
import { Helpers } from '../services/helpers/Helpers';
import { IUser, User } from '../entities/User';
import { AccessToken } from '../models/AccessToken';
import { BrevoManager } from './BrevoManager';

export class AuthManager {

    static async createAuth(email: string): Promise<string> {
        const requestsCount = await Auth.countDocuments({ email, createdAt: { $gte: new Date(Date.now() - 1000 * 60 * 60) } });
        if (requestsCount >= 5) {
            throw new BadRequestError('Too many requests. Try again later.', 'email');
        }

        await BrevoManager.createContact({email}, [BrevoManager.allUsersListId]);

        const request = new Auth();
        request.email = email;
        request.code = this.generateCode();
        request.tries = 0;
        request.lastSentAt = new Date();
        request.createdAt = new Date();
        await request.save();

        // send email
        await BrevoManager.sendAuthTransactionalEmail(request.email, request.code);

        return request.id;
    }

    static async resendAuthRequest(requestId: string): Promise<void> {        
        const request = await Auth.findById(requestId);
        if (!request || request.createdAt!.getTime() < Date.now() - 1000 * 60 * 10) { // request is valid for 10 minutes
            throw new BadRequestError('Invalid request', 'requestId');
        }
        if (request.tries >= 5) {
            throw new BadRequestError('Too many wrong tries.', 'requestId');
        }
        if (request.lastSentAt.getTime() > Date.now() - 1000 * 60) {
            throw new BadRequestError('Try again in a minute', 'requestId');
        }

        await Auth.updateOne({ _id: requestId }, { lastSentAt: new Date()  });

        // send email
        await BrevoManager.sendAuthTransactionalEmail(request.email, request.code);
    }

    static async validate(requestId: string, code: string): Promise<IAuth> {        
        const request = await Auth.findByIdAndUpdate(requestId, { $inc: { tries: 1 } }, { new: true });

        if (!request || request.createdAt!.getTime() < Date.now() - 1000 * 60 * 10) { // request is valid for 10 minutes
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
            return existingUser;
        }

        const user = new User();
        user.email = email;
        user.createdAt = new Date();
        await user.save();

        return user;
    }


}