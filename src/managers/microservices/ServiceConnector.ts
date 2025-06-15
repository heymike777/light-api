import { TxParser } from "../../services/solana/geyser/TxParser";
import { Chain } from "../../services/solana/types";
import { RedisManager } from "../db/RedisManager";
import { EnvManager } from "../EnvManager";
import { LogManager } from "../LogManager";
import { SwapManager } from "../SwapManager";
import { WalletManager } from "../WalletManager";

export enum ServiceType {
    GEYSER = 'geyser',
}

interface IConnectorService {
    listId: ServiceType;
    pushItem(data: string): Promise<boolean>;
    getItem(): Promise<string | undefined>;
    readItems(callback: (item: string) => void): Promise<void>;
}

class ConnectorService implements IConnectorService {
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

interface IGeyserItem {
    chain: Chain;
    tx: string;
    timestamp: number;
    geyserId: string;
    signature: string;
}

export class ServiceConnector {
    private geyserService: ConnectorService;

    constructor(){
        this.geyserService = new ConnectorService(ServiceType.GEYSER);
        if (EnvManager.isMainProcess){
            this.geyserService.readItems(this.onGeyserItem);
        }
    }

    async onGeyserItem(itemStr: string): Promise<void> {
        LogManager.forceLog('ServiceConnector', 'onGeyserItem', 'Item:', itemStr);
        try {
            const item: IGeyserItem = JSON.parse(itemStr);
            const jsonParsed = JSON.parse(item.tx);
            
            const parsedTransactionWithMeta = await TxParser.parseGeyserTransactionWithMeta(jsonParsed);
            if (parsedTransactionWithMeta){
                WalletManager.processWalletTransaction(item.chain, parsedTransactionWithMeta, item.geyserId);
            }

            SwapManager.receivedConfirmationForSignature(item.chain, item.signature, parsedTransactionWithMeta);
        } catch (error) {
            LogManager.error('ServiceConnector', 'onGeyserItem', 'Error parsing item:', error);
            return;
        }
    }

    async pushGeyserItem(chain: Chain, geyserId: string, signature: string, tx: string): Promise<void> {
        const item: IGeyserItem = {
            chain,
            geyserId,
            signature,
            tx,
            timestamp: Date.now(),
        }
        await this.geyserService.pushItem(JSON.stringify(item));
        LogManager.forceLog('ServiceConnector', 'pushGeyserItem', 'Item:', item);
    }

    // -------- static --------

    static instance?: ServiceConnector;
    static getInstance(): ServiceConnector {
        if (!this.instance){
            this.instance = new ServiceConnector();
        }
        return this.instance;
    }

}
