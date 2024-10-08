import { CustomError } from "./CustomError";

export class PremiumError extends CustomError {
    statusCode = 444;

    constructor(message: string) {
        super(message);

        Object.setPrototypeOf(this, PremiumError.prototype);
    }

    serializeErrors() {
        return [
            { message: this.message }
        ]
    }
}