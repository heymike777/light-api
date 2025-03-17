import dotenv from "dotenv";
import fs from "fs";
import { LogManager } from "../../managers/LogManager";

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
LogManager.log('process.env.ENVIRONMENT', process.env.ENVIRONMENT);
