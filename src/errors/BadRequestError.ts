import { CustomError } from "./CustomError";

export class BadRequestError extends CustomError {
    statusCode = 400;

    constructor(message: string, private field?: string) {
        super(message);

        Object.setPrototypeOf(this, BadRequestError.prototype);
    }

    serializeErrors() {
        return [
            { message: this.message, field: this.field }
        ]
    }
}