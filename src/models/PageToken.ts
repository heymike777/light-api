export class PageToken {
    ids: string[];
    pageSize: number;

    constructor(ids: string[], pageSize: number){
        this.ids = ids;
        this.pageSize = pageSize;
    }

    toJSON() {
        return Buffer.from(JSON.stringify({
            ids: this.ids, 
            pageSize: this.pageSize, 
        })).toString('base64');
    }

    static parse(tokenString?: string): PageToken | undefined {
        if (tokenString == undefined) return undefined;

        try {
            const pageToken:PageToken = JSON.parse(Buffer.from(tokenString, 'base64').toString('ascii'));
            return pageToken;
        }
        catch (error){
            // console.error(error);
        }

        return undefined;
    }
}