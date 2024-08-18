interface ErrorResponseItem {
    message: string;
    code?: number;
    field?: string;
}

export class ErrorResponse {    
    constructor(private errors:ErrorResponseItem[]) {
    }
}