import { TxParser } from "../../services/solana/geyser/TxParser";
import { YellowstoneManager } from "../../services/solana/geyser/YellowstoneManager";
import { ChaosManager } from "../../services/solana/svm/ChaosManager";
import { Chain } from "../../services/solana/types";
import { SendMessageData } from "../bot/BotTypes";
import { RedisManager } from "../db/RedisManager";
import { EnvManager } from "../EnvManager";
import { LogManager } from "../LogManager";
import { RabbitManager } from "../RabbitManager";
import { SwapManager } from "../SwapManager";
import { WalletManager } from "../WalletManager";
import { ConnectorService } from "./IConnectorService";

export enum ServiceType {
    MAIN = 'main',
    TELEGRAM = 'telegram',
    GEYSER = 'geyser',
}

interface IGeyserItem {
    resubscribe: boolean;
    timestamp: number;
}

interface IMainGeyserItem {
    chain: Chain;
    tx: string;
    geyserId: string;
    signature: string;
    timestamp: number;
}

interface ITelegramMessage {
    message: string;
    timestamp: number;
}

export class ServiceConnector {
    private mainService: ConnectorService;
    private telegramService: ConnectorService;
    private geyserService: ConnectorService;
    
    constructor(){
        this.mainService = new ConnectorService(ServiceType.MAIN);
        if (EnvManager.isMainProcess){
            this.mainService.readItems(this.onMainItem);
        }
        
        this.telegramService = new ConnectorService(ServiceType.TELEGRAM);
        if (EnvManager.isTelegramProcess){
            this.telegramService.readItems(this.onTelegramMessage);
        }

        this.geyserService = new ConnectorService(ServiceType.GEYSER);
        if (EnvManager.isGeyserProcess){
            this.geyserService.readItems(this.onGeyserItem);
        }
    }

    // -------- Main --------

    async onMainItem(itemStr: string): Promise<void> {
        // LogManager.forceLog('ServiceConnector', 'onMainItem', 'Item:', itemStr);
        try {
            const item: IMainGeyserItem = JSON.parse(itemStr);
            const jsonParsed = JSON.parse(item.tx);
            
            const parsedTransactionWithMeta = await TxParser.parseGeyserTransactionWithMeta(jsonParsed);
            if (parsedTransactionWithMeta){
                WalletManager.processWalletTransaction(item.chain, parsedTransactionWithMeta, item.geyserId);
            }

            SwapManager.receivedConfirmationForSignature(item.chain, item.signature, parsedTransactionWithMeta);
            ChaosManager.receivedConfirmationForSignature(item.chain, item.signature);
        } catch (error) {
            LogManager.error('ServiceConnector', 'onMainItem', 'Error parsing item:', error);
            return;
        }
    }

    async pushMainGeyserItem(chain: Chain, geyserId: string, signature: string, tx: string): Promise<void> {
        const item: IMainGeyserItem = {
            chain,
            geyserId,
            signature,
            tx,
            timestamp: Date.now(),
        }
        await this.mainService.pushItem(JSON.stringify(item));
        // LogManager.forceLog('ServiceConnector', 'pushMainGeyserItem', 'Item:', item);
    }

    // -------- Telegram --------

    async onTelegramMessage(itemStr: string): Promise<void> {
        // LogManager.forceLog('ServiceConnector', 'onTelegramMessage', 'Item:', itemStr);
        try {
            const item: ITelegramMessage = JSON.parse(itemStr);
            const message: SendMessageData = JSON.parse(item.message);
            await RabbitManager.receivedMessage(message);
        } catch (error) {
            LogManager.error('ServiceConnector', 'onTelegramMessage', 'Error parsing item:', error);
            return;
        }
    }

    async pushTelegramMessage(messageData: string): Promise<void> {
        const item: ITelegramMessage = {
            message: messageData,
            timestamp: Date.now(),
        }
        await this.telegramService.pushItem(JSON.stringify(item));
        // LogManager.forceLog('ServiceConnector', 'pushTelegramMessage', 'Item:', item);
    }

    // -------- Geyser --------

    async onGeyserItem(itemStr: string): Promise<void> {
        // LogManager.forceLog('ServiceConnector', 'onGeyserItem', 'Item:', itemStr);
        try {
            const item: IGeyserItem = JSON.parse(itemStr);
            if (item.resubscribe){
                await WalletManager.fetchAllWalletAddresses();
            }
        } catch (error) {
            LogManager.error('ServiceConnector', 'onGeyserItem', 'Error parsing item:', error);
            return;
        }
    }

    async pushGeyserResubscribe(): Promise<void> {
        const item: IGeyserItem = {
            resubscribe: true,
            timestamp: Date.now(),
        }
        await this.mainService.pushItem(JSON.stringify(item));
        // LogManager.forceLog('ServiceConnector', 'pushGeyserResubscribe', 'Item:', item);
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
