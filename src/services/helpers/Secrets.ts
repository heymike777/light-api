import dotenv from "dotenv";
import fs from "fs";

if (process.env.NODE_ENV === "DEVELOPMENT") {
    if (fs.existsSync(".env.development")) {
        dotenv.config({ path: ".env.development" });
    }
}
else {
    if (fs.existsSync(".env.production")) {
        dotenv.config({ path: ".env.production" });
    }
}
console.log('process.env.ENVIRONMENT', process.env.ENVIRONMENT);

if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN must be defined');
}