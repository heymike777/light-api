import { CustomError } from "./CustomError";

export class PermissionError extends CustomError {
    statusCode = 400;
    message = 'You don\'t have permission';

    constructor() {
        super('You don\'t have permission');

        Object.setPrototypeOf(this, PermissionError.prototype);
    }

    serializeErrors() {
        return [
            { message: this.message }
        ]
    }
}