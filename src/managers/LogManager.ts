import { createLogger, format, transports } from 'winston';

export class LogManager {
    static isLogsEnabled = false;
    static isErrorsEnabled = true;

    static logger = createLogger({
        level: 'info',
        format: format.combine(
            format.timestamp(),
            format.printf(({ timestamp, level, message }) =>
                `${timestamp} [${level.toUpperCase()}, ${process.env.SERVER_NAME}]: ${message}`
            )
        ),
        transports: [
            new transports.File({ filename: 'logs/error.log', level: 'error' }),
            new transports.File({ filename: 'logs/combined.log' }),
        ],
    });

    static log(...args: any[]){
        this.logger.info(args.map((a: any) => a?.toString()).join(' '));
        if (this.isLogsEnabled){
            try {
                console.log(new Date(), ...args);
            }
            catch (e: any){
            }
        }
    }

    static forceLog(...args: any[]){
        this.logger.info(args.map((a: any) => a?.toString()).join(' '));
        try {
            console.log(new Date(), ...args);
        }
        catch (e: any){
        }
    }

    static error(...args: any[]){
        this.logger.error(args.map((a: any) => a?.toString()).join(' '));
        if (this.isErrorsEnabled){
            try {
                console.error(new Date(), ...args);
            }
            catch (e: any){
            }
        }
    }

}