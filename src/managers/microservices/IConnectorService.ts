import { RedisManager } from "../db/RedisManager";
import { LogManager } from "../LogManager";
import { ServiceType } from "./ServiceConnector";

export interface IConnectorService {
    listId: ServiceType;
    pushItem(data: string): Promise<boolean>;
    getItem(): Promise<string | undefined>;
    readItems(callback: (item: string) => void): Promise<void>;
}

export class ConnectorService implements IConnectorService {
    listId: ServiceType;

    constructor(listId: ServiceType){
        this.listId = listId;
    }

    async pushItem(data: string): Promise<boolean> {
        try {
            await RedisManager.instance?.client?.rPush(`stream:${this.listId}`, data);
        } catch (error) {
            LogManager.error('ServiceConnector', 'pushItem', 'Error pushing item to service:', error);
            return false;
        }

        return true;
    }

    async getItem(): Promise<string | undefined> {
        try {
            const item = await RedisManager.instance?.client?.lPop(`stream:${this.listId}`);
            return item || undefined;
        } catch (error) {
            LogManager.error('ServiceConnector', 'getItem', 'Error getting item from service:', error);
        }
        return undefined;
    }

    async readItems(callback: (item: string) => void): Promise<void> {
        while (true){
            const item = await this.getItem();
            if (item){
                callback(item);
            }
        }
    }
}