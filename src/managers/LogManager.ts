export class LogManager {
    static isLogsEnabled = process.env.ENVIRONMENT != 'DEVELOPMENT';
    static isErrorsEnabled = true;

    static log(...args: any[]){
        if (this.isLogsEnabled){
            try {
                console.log(new Date(), ...args);
            }
            catch (e: any){
            }
        }
    }

    static forceLog(...args: any[]){
        try {
            console.log(new Date(), ...args);
        }
        catch (e: any){
        }
    }

    static error(...args: any[]){
        if (this.isErrorsEnabled){
            try {
                console.error(new Date(), ...args);
            }
            catch (e: any){
            }
        }
    }

}