import { ValidationError } from 'express-validator';
import { CustomError } from './CustomError';

export class NotFoundError extends CustomError {
    statusCode = 404;
    reason = 'Not found';

    constructor() {
        super('Route not found');

        Object.setPrototypeOf(this, NotFoundError.prototype);
    }

    serializeErrors() {
        return [
            { message: this.reason }
        ]
    }
}