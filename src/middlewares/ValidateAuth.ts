import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PermissionError } from '../errors/PermissionError';
import { JWTAccessToken } from '../models/AccessToken';
import { LogManager } from '../managers/LogManager';

export function validateAuth(forceError: boolean = true) {
    return function(
        req: Request,
        res: Response,
        next: NextFunction
    ) {
        const accessTokenString = (req.headers.authorization || '').split(' ')[1] || '';
        if (accessTokenString === ''){ 
            if (forceError) next(new PermissionError());
            else next();

            return;
        }


        try {
            if (process.env.JWT_SECRET_KEY){
                const decodedToken = jwt.verify(accessTokenString, process.env.JWT_SECRET_KEY!) as JWTAccessToken;
                const accessToken = decodedToken.accessToken;

                req.accessToken = accessToken;

                if (accessToken && accessToken.userId){
                    // has permissions
                    next();
                    return;
                }
            }
            else{
                LogManager.error('JWT_SECRET_KEY is not set');
            }
        } catch(err) {
        }

        // don't have any of these permissions
        if (forceError) next(new PermissionError());
        else next();

    }
};