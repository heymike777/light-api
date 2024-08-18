import { ValidationError } from 'express-validator';
import { CustomError } from './CustomError';

export class NotAuthorizedError extends CustomError {
    statusCode = 400;

    constructor() {
        super('Unauthorized');

        Object.setPrototypeOf(this, NotAuthorizedError.prototype);
    }

    serializeErrors() {
        return [
            { message: 'Unauthorized' }
        ]
    }
}