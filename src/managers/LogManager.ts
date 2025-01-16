export class LogManager {
    static isLogsEnabled = process.env.ENVIRONMENT != 'PRODUCTION';
    static isErrorsEnabled = true;

    static log(...args: any[]){
        if (this.isLogsEnabled){
            console.log(new Date(), ...args);
        }
    }

    static forceLog(...args: any[]){
        console.log(new Date(), ...args);
    }

    static error(...args: any[]){
        if (this.isErrorsEnabled){
            console.error(new Date(), ...args);
        }
    }

}