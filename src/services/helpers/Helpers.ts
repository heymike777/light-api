import { IWallet } from "../../entities/Wallet";
import { kKnownAddresses, kValidators } from "../../managers/constants/ValidatorConstants";
import { Token } from "../../managers/TokenManager";
import { PageToken } from "../../models/PageToken";
import { Request } from "express";


export class Helpers {

    static async sleep(seconds: number) {
        return new Promise(resolve => setTimeout(resolve, seconds * 1000));
    }
 
    static getRandomInt(min: number, max: number) {
        min = Math.ceil(min);
        max = Math.floor(max);
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    static getProbability(winProbability: number): boolean {
        return this.getRandomInt(1, 10000) <= winProbability * 100;
    }   

    static prettyNumber(n: number, roundDecimals?: number): string {
        if (roundDecimals != undefined){
            const tmp = 10 ** roundDecimals;

            // n = (n > 0 ? Math.floor(n * tmp) : Math.ceil(n * tmp)) / tmp;
            n = Math.round(n * tmp) / tmp;
        }
        return this.numberWithCommas(n);
    }

    static padNumber(d: number): string {
        return (d < 10) ? '0' + d.toString() : d.toString();
    }

    static numberWithCommas(x: number): string {
        return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    static numberFormatter(num: number, digits: number): string {
        const lookup = [
          { value: 1, symbol: "" },
          { value: 1e3, symbol: "k" },
          { value: 1e6, symbol: "M" },
          { value: 1e9, symbol: "G" },
          { value: 1e12, symbol: "T" },
          { value: 1e15, symbol: "P" },
          { value: 1e18, symbol: "E" }
        ];
        const rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
        var item = lookup.slice().reverse().find(function(item) {
          return num >= item.value;
        });
        return item ? (num / item.value).toFixed(digits).replace(rx, "$1") + item.symbol : "0";
      }

    static getNextDayOfWeek(dayOfWeek: number, hours: number, minutes: number, seconds: number) {
        // Code to check that date and dayOfWeek are valid left as an exercise ;)

        if (dayOfWeek < 0 || dayOfWeek > 6) {
            throw new Error('dayOfWeek must be between 0 and 6');
        }

        const date = new Date();
        date.setHours(hours);
        date.setMinutes(minutes);
        date.setSeconds(seconds);
        date.setMilliseconds(0);

        const resultDate = new Date(date.getTime());    
        resultDate.setDate(date.getDate() + (7 + dayOfWeek - date.getDay()) % 7);
        return resultDate;
    }

    static getDateWithDaysInc(date: Date, daysInc: number) {
        const resultDate = new Date(date.getTime());    
        resultDate.setDate(date.getDate() + daysInc);
        return resultDate;
    }

    static isEmptyString(str: string | undefined): boolean {
        if (str && str!=null && str!='' && str!='null'){
            return false;
        }

        return true;
    }

    static prettyWallet(address: string): string {
        return address.substring(0, 4) + '...' + address.substring(address.length - 4, address.length);
    }

    static parsePageToken(req: Request): PageToken | undefined {
        let pageToken: PageToken | undefined;
        try {
            if (req.body?.pageToken != undefined){
                pageToken = PageToken.parse(req.body.pageToken.toString());
            }
            else if (req.query?.pageToken != undefined){
                pageToken = PageToken.parse(req.query.pageToken.toString());
            }
        }
        catch (err){}

        return pageToken;
    }

    static replaceAddressesWithPretty(text: string, addresses: string[] | undefined, wallets: IWallet[], txTokens?: Token[]): string {
        if (addresses && addresses.length > 0){
            for (let index = 0; index < addresses.length; index++) {
                const address = addresses[index];
                const wallet = wallets.find(w => w.walletAddress == address);
                const txToken = txTokens?.find(t => t.address == address);

                let title = undefined;
                if (wallet?.title){
                    title = wallet?.title;
                }
                else if (kValidators[address]){
                    title = kValidators[address].name;
                }
                else if (kKnownAddresses[address]){
                    title = kKnownAddresses[address].name;
                }
                else if (txToken){
                    title = txToken.nft ? txToken.nft.title : (txToken.symbol || txToken.name);
                }

                if (!title || title==''){
                    title = this.prettyWallet(address);
                }
                
                text = text.replaceAll(`{address${index}}`, title);
            }
        }

        return text;
    }

    static dateDiffString(date1: Date, date2: Date): string {
        const ms = Math.abs(date2.getTime() - date1.getTime());

        const days = Math.floor(ms / (24*60*60*1000));
        const daysms = ms % (24*60*60*1000);
        const hours = Math.floor(daysms / (60*60*1000));
        const hoursms = ms % (60*60*1000);
        const minutes = Math.floor(hoursms / (60*1000));
        const minutesms = ms % (60*1000);
        const sec = Math.floor(minutesms / 1000);

        const str = '';
        if (days > 0){
            return days + " days" + (hours > 0 ? ' ' + hours + ' hours' : '');
        }
        else if (hours > 0){
            return hours + " hours" + (minutes > 0 ? ' ' + minutes + ' minutes' : '');
        }
        else if (minutes > 0){
            return minutes + " minutes" + (sec > 0 ? ' ' + sec + ' seconds' : '');
        }
        else {
            return sec + " seconds";
        }
    }

    static getIpAddress(req: Request): string | undefined {
        return req.headers['cf-connecting-ip'] as string || undefined
    }
    
}