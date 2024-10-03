export interface JWTAccessToken {
    accessToken: AccessToken;
}

export class AccessToken {
    userId: string;

    constructor(userId: string) {
        this.userId = userId;
    }

    serialize() {
        return [
            { 
                userId: this.userId,
            }
        ]
    }
}