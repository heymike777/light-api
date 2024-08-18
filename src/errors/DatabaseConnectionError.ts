import { CustomError } from "./CustomError";

export class DatabaseConnectionError extends CustomError {
    statusCode = 500;
    message = 'Error connection to database';

    constructor() {
        super('Error connecting to db');

        Object.setPrototypeOf(this, DatabaseConnectionError.prototype);
    }

    serializeErrors() {
        return [
            { message: this.message }
        ]
    }
}