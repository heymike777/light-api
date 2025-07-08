import { Context } from "grammy";
import { UserManager } from "../../UserManager";
import { BotHelper, Message } from "./BotHelper";
import { IUser, TelegramWaitingType, User } from "../../../entities/users/User";
import { BotManager } from "../BotManager";
import { TraderProfilesManager } from "../../TraderProfilesManager";
import { LogManager } from "../../LogManager";
import { InlineButton, TgMessage } from "../BotTypes";
import { SwapManager } from "../../SwapManager";
import { Chain, DexId, Priority } from "../../../services/solana/types";
import { Farm, FarmStatus, FarmType, IFarm } from "../../../entities/Farm";
import { IUserTraderProfile, UserTraderProfile } from "../../../entities/users/TraderProfile";
import { ChainManager } from "../../chains/ChainManager";
import { getNativeToken, kSolAddress } from "../../../services/solana/Constants";
import { SolanaManager } from "../../../services/solana/SolanaManager";
import { ExplorerManager } from "../../../services/explorers/ExplorerManager";

type Dex = {
    id: DexId;
    name: string;
}

export class BotFarmHelper extends BotHelper {

    private static DEXES: { [key: string]: Dex[] } = {
        [Chain.SONIC]: [
            { id: DexId.SEGA, name: 'Sega' }

        ]
    }
    private static FREQUENCIES: ({seconds: number, title: string, default: boolean} | undefined)[] = [
        { seconds: 5, title: '5s', default: true },
        { seconds: 10, title: '10s', default: false },
        { seconds: 30, title: '30s', default: false },
        { seconds: 60, title: '1m', default: false },
        undefined,
        { seconds: 120, title: '2m', default: false },
        { seconds: 300, title: '5m', default: false },
        { seconds: 600, title: '10m', default: false },
        { seconds: 1800, title: '30m', default: false },
        undefined,
        { seconds: 3600, title: '1h', default: false },
        { seconds: 21600, title: '6h', default: false },
        { seconds: 43200, title: '12h', default: false },
        { seconds: -1, title: 'Custom', default: false },

    ];

    private static VOLUMES: ({usd: number, title: string, default: boolean, minSolAmount: number} | undefined)[] = [
        { usd: 50000, title: '$50k', default: false, minSolAmount: 1 },
        { usd: 100000, title: '$100k', default: true, minSolAmount: 2 },
        { usd: 500000, title: '$500k', default: false, minSolAmount: 10 },
        undefined,
        { usd: 1000000, title: '$1M', default: false, minSolAmount: 20 },
        { usd: 5000000, title: '$5M', default: false, minSolAmount: 100 },
        { usd: -1, title: 'Custom', default: false, minSolAmount: 0 },
    ];

    constructor() {
        const replyMessage: Message = {
            text: '⛏️ Pump farm'
        };

        super('farm', replyMessage);
    }

    async commandReceived(ctx: Context, user: IUser) {
        await UserManager.updateTelegramState(user.id, undefined);

        const buttonId = ctx.update?.callback_query?.data;

        if (ctx?.update?.message?.text == '/farm' || buttonId == 'farm'){

            const replyMessage = await BotFarmHelper.buildInitReplyMessage(user);
            return await super.commandReceived(ctx, user, replyMessage);
        }
        else if (buttonId == 'farm|dex'){
            const replyMessage = await BotFarmHelper.buildFarmDexMessage(user);
            return await super.commandReceived(ctx, user, replyMessage);
        }
        else if (buttonId == 'farm|my_farms'){
            const replyMessage = await BotFarmHelper.buildMyFarmsMessage(user);
            return await super.commandReceived(ctx, user, replyMessage);
        }
        else if (buttonId == 'farm|my_farms|refresh'){
            const replyMessage = await BotFarmHelper.buildMyFarmsMessage(user);
            await BotManager.editMessage(ctx, replyMessage.text, replyMessage.markup);    
        }
        else if (buttonId == 'farm|token'){
            //TODO: do noting for now. we'll add token volume boost later.
        }
        else if (buttonId && buttonId.startsWith('farm|')){
            const parts = buttonId.split('|');
            if (parts.length == 3 || parts.length == 4){
                const farmId: string = parts[1];
                const action = parts[2];

                const farm = await Farm.findById(farmId);
                if (!farm || farm.status == FarmStatus.COMPLETED){
                    await BotManager.reply(ctx, '🟡 Farm not found');
                    return;
                }

                if (action == 'refresh'){
                    await this.refreshFarm(ctx, user, farm);
                }
                else if (action == 'continue'){
                    await this.startFarmConfirmation(ctx, user, farm);
                }
                else if (action == 'start'){
                    await this.startFarm(ctx, user, farm);
                }
                else if (action == 'prof'){
                    let traderProfileId = parts[3];
                    if (traderProfileId == 'create'){ 
                        const traderProfile = await this.createTraderProfile(ctx, user);
                        if (traderProfile) {
                            traderProfileId = traderProfile.id;
                        }
                    }

                    if (traderProfileId == 'create'){
                        return;
                    }
                    
                    farm.traderProfileId = traderProfileId;
                    await Farm.updateOne({ _id: farmId }, { traderProfileId: farm.traderProfileId });
                    await this.refreshFarm(ctx, user, farm);    
                }
                else if (action == 'frequency'){
                    const frequency = parseInt(parts[3]);

                    if (frequency == -1){
                        await BotManager.reply(ctx, 'Enter a frequency of swaps <b>in seconds</b>');
                        await UserManager.updateTelegramState(user.id, { waitingFor: TelegramWaitingType.FARM_FREQUENCY, helper: this.kCommand, data: { farmId, messageId: BotManager.getMessageIdFromContext(ctx) } });
                        return;
                    }
                    else {
                        farm.frequency = frequency;
                        await Farm.updateOne({ _id: farmId }, { frequency: farm.frequency });
                        await this.refreshFarm(ctx, user, farm);    
                    }
                }
                else if (action == 'volume'){
                    const volume = parseInt(parts[3]);
                    if (volume == -1){
                        await BotManager.reply(ctx, 'Enter a volume of swaps <b>in USD</b>');
                        await UserManager.updateTelegramState(user.id, { waitingFor: TelegramWaitingType.FARM_VOLUME, helper: this.kCommand, data: { farmId, messageId: BotManager.getMessageIdFromContext(ctx) } });
                        return;
                    }
                    else {
                        farm.volume = volume;
                        await Farm.updateOne({ _id: farmId }, { volume: farm.volume });
                        await this.refreshFarm(ctx, user, farm);
                    }
                }
                else if (action == 'dex'){
                    const dexId = parts[3] as DexId;
                    farm.dexId = dexId;
                    await Farm.updateOne({ _id: farmId }, { dexId: farm.dexId });
                    await this.refreshFarm(ctx, user, farm);
                }
            }
            else {
                LogManager.error('Invalid buttonId:', buttonId);
            }
        }
    }

    async refreshFarm(ctx: Context, user: IUser, farm: IFarm, messageId?: number) {
        const replyMessage = await BotFarmHelper.buildFarmDexMessage(user, farm);
        await BotManager.editMessage(ctx, replyMessage.text, replyMessage.markup, messageId || BotManager.getMessageIdFromContext(ctx));
    }

    async startFarmConfirmation(ctx: Context, user: IUser, farm: IFarm) {
        const traderProfiles = await TraderProfilesManager.getUserTraderProfiles(user.id, SwapManager.kNativeEngineId);
        const traderProfile = traderProfiles.find(tp => tp.id == farm.traderProfileId);
        if (!traderProfile){
            await BotManager.reply(ctx, '🟡 Trader profile not found');
            return;
        }
        if (!traderProfile.encryptedWallet?.publicKey){
            await BotManager.reply(ctx, '🟡 Trader profile has no wallet. Please, select another trader profile.');
            return;
        }

        const frequency = BotFarmHelper.FREQUENCIES.find(f => f?.seconds == farm.frequency);
        const frequencyTitle = frequency ? `${frequency.title}` : `${farm.frequency}s`;
        const dex = BotFarmHelper.DEXES[farm.chain].find(d => d.id == farm.dexId);

        const volume = BotFarmHelper.VOLUMES.find(v => v?.usd == farm.volume);

        const kSOL = getNativeToken(farm.chain);

        let text = `🏁 New farm\n\n`;
        text += `Chain: ${ChainManager.getChainTitle(farm.chain)}\n`;
        text += `DEX: ${dex?.name || 'Unknown'}\n`;
        text += `Frequency: ${frequencyTitle}\n`;
        text += `Volume: ~$${farm.volume}\n`;
        text += `Trader profile: ${traderProfile.title}\n`;

        if (farm.pools.length > 0){
            text += `Pools: ${farm.pools.map(p => `<a href="${ExplorerManager.getUrlToAddress(farm.chain, p.address)}">${p.title || p.address}</a>`).join(', ')}\n`;
        }
        
        text += '\n';
        text += `Wallet: <code>${traderProfile.encryptedWallet.publicKey}</code>\n`;
        const solBalance = await SolanaManager.getWalletSolBalance(farm.chain, traderProfile.encryptedWallet?.publicKey);
        text += `Balance: ${solBalance?.uiAmount || 0} ${kSOL.symbol}\n`;
        if (volume && volume.minSolAmount > 0 && (solBalance?.uiAmount || 0) < volume.minSolAmount){
            text += `Suggested balance: ${volume.minSolAmount} ${kSOL.symbol}\n`;
        }

        const buttons: InlineButton[] = [
            { id: `farm|${farm.id}|start`, text: '🏁 Confirm and start' },
            // { id: `delete_message`, text: '✕ Close' },
        ];
        const markup = BotManager.buildInlineKeyboard(buttons);
        await BotManager.reply(ctx, text, { reply_markup: markup });
    }

    async startFarm(ctx: Context, user: IUser, farm: IFarm) {
        farm.status = FarmStatus.ACTIVE;
        await Farm.updateOne({ _id: farm.id }, { status: farm.status });
        await BotManager.reply(ctx, '🏁 Starting the farm...');
    }

    async createTraderProfile(ctx: Context, user: IUser): Promise<IUserTraderProfile | undefined> {
        const countAll = await UserTraderProfile.countDocuments({ userId: user.id });
        const engineId = SwapManager.kNativeEngineId;
        const title = `Wallet ${countAll+1}`;
        const defaultAmount = 0.25;
        const slippage = 10;

        try {
            const traderProfile = await TraderProfilesManager.createTraderProfile(user, engineId, title, Priority.MEDIUM, defaultAmount, slippage, undefined);
            return traderProfile;
        }
        catch (e: any){
            LogManager.error('e:', e);
            if (e.statusCode == 444){
                // premium error
                await BotManager.replyWithPremiumError(ctx, e.message);
            }
            else {
                await BotManager.reply(ctx, e.message);
            }
        }

        return undefined;
    }

    async messageReceived(message: TgMessage, ctx: Context, user: IUser): Promise<boolean> {
        LogManager.log('BotFarmHelper', 'messageReceived', message.text);

        super.messageReceived(message, ctx, user);

        if (user.telegramState?.waitingFor == TelegramWaitingType.FARM_FREQUENCY){
            const frequencyString = message.text.trim().replaceAll(',', '.');
            const frequency = parseFloat(frequencyString);
            if (isNaN(frequency) || frequency <= 0 || frequency > 86400){
                await BotManager.reply(ctx, 'Invalid frequency. Please, try again.\n<b>Frequency must be between 1 and 86400 seconds</b>');
                return true;
            }

            const farmId = user.telegramState.data.farmId;
            const farm = await Farm.findById(farmId);
            if (!farm){
                await BotManager.reply(ctx, '🟡 Farm not found');
                return true;
            }

            farm.frequency = frequency;
            await Farm.updateOne({ _id: farmId }, { frequency: farm.frequency });
            await this.refreshFarm(ctx, user, farm, user.telegramState.data.messageId);

            await UserManager.updateTelegramState(user.id, undefined);
            return true;
        }
        else if (user.telegramState?.waitingFor == TelegramWaitingType.FARM_VOLUME){
            const volumeString = message.text.trim().replaceAll(',', '.');
            const volume = parseFloat(volumeString);
            if (isNaN(volume) || volume <= 0){
                await BotManager.reply(ctx, 'Invalid volume. Please, try again.\n<b>Volume must be greater than 0</b>');
                return true;
            }

            const farmId = user.telegramState.data.farmId;
            const farm = await Farm.findById(farmId);
            if (!farm){
                await BotManager.reply(ctx, '🟡 Farm not found');
                return true;
            }

            farm.volume = volume;
            await Farm.updateOne({ _id: farmId }, { volume: farm.volume });
            await this.refreshFarm(ctx, user, farm, user.telegramState.data.messageId);

            await UserManager.updateTelegramState(user.id, undefined);
            return true;
        }

        return false;
    }

    static async buildLimitChainMessage(): Promise<Message> {
        const buttons: InlineButton[] = [
            { id: `settings|set_chain|${Chain.SONIC}`, text: `🔗 Switch to Sonic SVM` }
        ];
        const markup = BotManager.buildInlineKeyboard(buttons);
        return { 
            text: '⛏️ Pump farm is only available on Sonic SVM for now.',
            buttons: buttons,
            markup: markup
        };    
    }

    static async buildInitReplyMessage(user: IUser): Promise<Message> {
        if (user.defaultChain != Chain.SONIC){
            return this.buildLimitChainMessage();
        }

        const buttons: InlineButton[] = [
            { id: 'farm|token', text: '🔥 Token volume (soon)' },
            { id: 'farm|dex', text: '💰 DEX volume' },
            { id: 'row', text: '' },
            { id: 'farm|my_farms', text: '⛏️ My farms' },
        ];
        const markup = BotManager.buildInlineKeyboard(buttons);

        return {
            text: '⛏️ Pump farm\n\nDo you want to boost a specific token volume or farm DEX volume?',
            buttons: buttons,
            markup: markup
        };
    }

    static async buildFarmDexMessage(user: IUser, farm?: IFarm): Promise<Message> {
        const chain = user.defaultChain || Chain.SOLANA;
        const dexes = BotFarmHelper.DEXES[chain];
        if (!dexes){
            return this.buildLimitChainMessage();
        }

        const traderProfiles = await TraderProfilesManager.getUserTraderProfiles(user.id, SwapManager.kNativeEngineId);

        if (!farm){
            const traderProfile = traderProfiles.find(tp => tp.default);

            const countAll = await Farm.countDocuments({ userId: user.id });
            const title = `Farm #${countAll+1}`;

            farm = new Farm();
            farm.chain = chain;
            farm.userId = user.id;
            farm.title = title;
            farm.traderProfileId = traderProfile?.id;
            farm.status = FarmStatus.CREATED;
            farm.type = FarmType.DEX;
            farm.dexId = dexes[0].id;
            farm.frequency = BotFarmHelper.FREQUENCIES.find(f => f?.default)?.seconds || 5;
            farm.volume = BotFarmHelper.VOLUMES.find(v => v?.default)?.usd || 100000;
            farm.fee = 0;

            //TODO: this is hardcoded for now. we'll add pool selection later.
            farm.pools = [
                { address: 'CKkoETT652fNFs8tYncMokW6SFwKENpTTDndAo1HkR7J', tokenA: kSolAddress, tokenB: 'qPzdrTCvxK3bxoh2YoTZtDcGVgRUwm37aQcC3abFgBy', title: 'SOL/USDT' }
            ];

            await farm.save();
        }


        const buttons: InlineButton[] = [];

        buttons.push({ id: 'none', text: '--------------- SELECT DEX ---------------' });
        buttons.push({ id: 'row', text: '' });
        buttons.push(...dexes.map(dex => ({ id: `farm|${farm.id}|dex|${dex.id}`, text: (farm.dexId == dex.id ? '🟢 ' : '') + dex.name })));
        buttons.push({ id: 'row', text: '' });
        buttons.push({ id: 'none', text: '-------- SELECT TRADER PROFILE --------' });
        buttons.push({ id: 'row', text: '' });
        let profileIndex = 0;
        for (const traderProfile of traderProfiles) {
            buttons.push({ id: `farm|${farm.id}|prof|${traderProfile.id}`, text: (farm.traderProfileId == traderProfile.id ? '🟢 ' : '') + traderProfile.title });
            profileIndex++;
            if (profileIndex % 3 == 0){
                buttons.push({ id: 'row', text: '' });
            }
        }
        buttons.push({ id: `farm|${farm.id}|prof|create`, text: '➕ Add' }); 
        buttons.push({ id: 'row', text: '' });
        buttons.push({ id: 'none', text: '----- SELECT TIME BETWEEN SWAPS -----' });
        buttons.push({ id: 'row', text: '' });
        const isCustomFrequency = BotFarmHelper.FREQUENCIES.find(f => f?.seconds == farm.frequency) == undefined;
        for (const frequency of BotFarmHelper.FREQUENCIES) {
            if (frequency){
                const isSelected = farm.frequency == frequency.seconds || (isCustomFrequency && frequency.seconds == -1);
                let title = (isSelected ? '🟢 ' : '');
                if (isSelected && isCustomFrequency){
                    title += `${farm.frequency}s`;
                }
                else {
                    title += frequency.title;
                }
                buttons.push({ id: `farm|${farm.id}|frequency|${frequency.seconds}`, text: title });
            }
            else {
                buttons.push({ id: 'row', text: '' });
            }            
        }
        buttons.push({ id: 'row', text: '' });
        buttons.push({ id: 'none', text: '------------- SELECT VOLUME -------------' });
        buttons.push({ id: 'row', text: '' });
        const isCustomVolume = BotFarmHelper.VOLUMES.find(v => v?.usd == farm.volume) == undefined;
        for (const volume of BotFarmHelper.VOLUMES) {
            if (volume){
                const isSelected = farm.volume == volume.usd || (isCustomVolume && volume.usd == -1);
                let title = (isSelected ? '🟢 ' : '');
                if (isSelected && isCustomVolume){
                    title += `$${farm.volume}`;
                }
                else {
                    title += volume.title;
                }
                buttons.push({ id: `farm|${farm.id}|volume|${volume.usd}`, text: title });
            }
            else {
                buttons.push({ id: 'row', text: '' });
            }            
        }
        // buttons.push(...BotFarmHelper.VOLUMES.map(v => (v ? { id: `farm|${farm.id}|volume|${v.usd}`, text: (farm.volume == v.usd ? '🟢 ' : '') + v.title } : { id: 'row', text: '' })));
        buttons.push({ id: 'row', text: '' });
        buttons.push({ id: 'none', text: '--------------- ACTIONS ---------------' });
        buttons.push({ id: 'row', text: '' });
        buttons.push({ id: `farm|${farm.id}|refresh`, text: '↻ Refresh' });
        buttons.push({ id: `delete_message`, text: '✕ Close' });
        buttons.push({ id: `row`, text: '' });
        buttons.push({ id: `farm|${farm.id}|continue`, text: '🏁 Continue' });

        const markup = BotManager.buildInlineKeyboard(buttons);

        return {
            text: '⛏️ Create a farm\n\nSelect a DEX, frequency and expected volume.\n\n👇 When you\'re ready, click “Continue” to start the bot.',
            buttons: buttons,
            markup: markup
        };
    }

    static async buildMyFarmsMessage(user: IUser): Promise<Message> {
        const farms = await Farm.find({ userId: user.id, status: { $in: [FarmStatus.ACTIVE, FarmStatus.PAUSED] } });

        let text = '⛏️ My farms';
        if (farms.length == 0){
            text += '\n\nNo active farms found.\nCreate a new farm to get started.';
        }
        else {
            for (const farm of farms) {
                text += '\n\n';
                text += farm.title || `Farm #${farm.id}`;
                text += '\n';
                text += `View | Pause`;
            }    
        }
        
        const buttons: InlineButton[] = [];
        buttons.push({ id: `farm|my_farms|refresh`, text: '↻ Refresh' });
        buttons.push({ id: `delete_message`, text: '✕ Close' });
        buttons.push({ id: 'row', text: '' });
        
        return { text: text, buttons: buttons, markup: BotManager.buildInlineKeyboard(buttons) };
    }

}