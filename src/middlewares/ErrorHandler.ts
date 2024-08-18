import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../errors/CustomError';
import { ErrorResponse } from '../responses/ErrorResponse';

export const errorHandler = (
    err: Error, 
    req: Request, 
    res: Response, 
    next: NextFunction
) => {
    let response: ErrorResponse;

    if (err instanceof CustomError) {
        response = new ErrorResponse(err.serializeErrors());
        return res.status(err.statusCode).send(response)
    }

    if (err.name === 'UnauthorizedError' || err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError'){
        if (err.message === 'jwt expired'){
            response = new ErrorResponse([{ code:112, message: 'Access token expired' }]);
        }
        else{
            response = new ErrorResponse([{ code:111, message: 'Unauthorized' }]);
        }
        return res.status(401).send(response);
    }

    response = new ErrorResponse([{ message: err.message }]);
    return res.status(500).send(response);
};