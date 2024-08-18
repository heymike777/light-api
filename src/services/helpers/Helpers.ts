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
    
}