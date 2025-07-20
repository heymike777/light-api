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
import { Farm, FarmStatus, FarmType, IFarm, IFarmPool } from "../../../entities/Farm";
import { IUserTraderProfile, UserTraderProfile } from "../../../entities/users/TraderProfile";
import { ChainManager } from "../../chains/ChainManager";
import { getNativeToken, kSolAddress, kSonicAddress } from "../../../services/solana/Constants";
import { SolanaManager } from "../../../services/solana/SolanaManager";
import { ExplorerManager } from "../../../services/explorers/ExplorerManager";
import { Swap } from "../../../entities/payments/Swap";
import { SegaManager } from "../../../services/solana/svm/SegaManager";
import { TokenManager } from "../../TokenManager";

type Dex = {
    id: DexId;
    name: string;
}

export class BotFarmHelper extends BotHelper {

    static DEXES: { [key: string]: Dex[] } = {
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
        { usd: 50000, title: '$50k', default: false, minSolAmount: 2.5 },
        { usd: 100000, title: '$100k', default: true, minSolAmount: 5 },
        { usd: 500000, title: '$500k', default: false, minSolAmount: 25 },
        undefined,
        { usd: 1000000, title: '$1M', default: false, minSolAmount: 50 },
        { usd: 5000000, title: '$5M', default: false, minSolAmount: 250 },
        { usd: -1, title: 'Custom', default: false, minSolAmount: 0 },
    ];

    constructor() {
        const replyMessage: Message = {
            text: '⛏️ Pump farm'
        };

        super('farm', replyMessage, ['my_farm']);
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
            await BotManager.reply(ctx, 'Send token CA address to boost volume');
            await UserManager.updateTelegramState(user.id, { waitingFor: TelegramWaitingType.FARM_TOKEN_CA, helper: this.kCommand, data: { messageId: BotManager.getMessageIdFromContext(ctx) } });
            return;
        }
        else if (buttonId && buttonId.startsWith('farm|')){
            const parts = buttonId.split('|');
            if (parts.length == 2){
                // farm details
                const farmId: string = parts[1];
                const replyMessage = await BotFarmHelper.buildMyFarmMessage(user, farmId);
                return await super.commandReceived(ctx, user, replyMessage);
            }
            else if (parts.length == 3 || parts.length == 4){
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
        else if (buttonId && buttonId.startsWith('my_farm|')){
            const parts = buttonId.split('|');
            if (parts.length == 3){
                const farmId: string = parts[1];
                const action = parts[2];

                if (action == 'refresh'){
                    await this.refreshMyFarm(ctx, user, farmId);
                }
                else if (action == 'resume'){
                    await this.resumeMyFarm(ctx, user, farmId);
                }
                else if (action == 'pause'){
                    await this.pauseMyFarm(ctx, user, farmId);
                }
                else if (action == 'delete'){
                    await this.deleteMyFarm(ctx, user, farmId);
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

        const farms = await Farm.find({ userId: user.id, traderProfileId: farm.traderProfileId, status: FarmStatus.ACTIVE });
        if (farms.length > 0){
            text += `\n\n🔴 This trader profile already has an active farm. Please, select other trader profile.`;
        }

        const buttons: InlineButton[] = [
            { id: `farm|${farm.id}|start`, text: '🏁 Confirm and start' },
            // { id: `delete_message`, text: '✕ Close' },
        ];
        const markup = BotManager.buildInlineKeyboard(buttons);
        await BotManager.reply(ctx, text, { reply_markup: markup });
    }

    async startFarm(ctx: Context, user: IUser, farm: IFarm) {
        const farms = await Farm.find({ userId: user.id, traderProfileId: farm.traderProfileId, status: FarmStatus.ACTIVE });
        if (farms.length > 0){
            await BotManager.reply(ctx, '🔴 This trader profile already has an active farm. Please, select other trader profile.');
            return;
        }


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
        else if (user.telegramState?.waitingFor == TelegramWaitingType.FARM_TOKEN_CA){
            const tokenCa = message.text.trim();
            if (!tokenCa){
                await BotManager.reply(ctx, 'Invalid token CA. Please, try again.\n<b>Token CA must be a valid address</b>');
                return true;
            }

            const replyMessage = await BotFarmHelper.startFarmForToken(ctx, user, tokenCa);
            if (replyMessage){
                await super.commandReceived(ctx, user, replyMessage);
            }

            return true;
        }

        return false;
    }

    static async startFarmForToken(ctx: Context, user: IUser, tokenCa: string): Promise<Message | undefined> {
        const chain = user.defaultChain || Chain.SOLANA;
        const token = await TokenManager.getToken(chain, tokenCa);

        let farmPools: IFarmPool[] | undefined = [];
        let isValid = false;
        if (chain == Chain.SONIC){
            if (!isValid){
                const poolInfo = await SegaManager.fetchPoolForMints(tokenCa, kSolAddress);
                if (poolInfo){
                    isValid = true;
                    const title = token?.symbol ? `SOL/${token.symbol}` : undefined;
                    farmPools.push({ address: poolInfo.poolId, tokenA: kSolAddress, tokenB: tokenCa, title: title });
                }
            }

            if (!isValid){
                const poolInfo = await SegaManager.fetchPoolForMints(tokenCa, kSonicAddress);
                if (poolInfo){
                    isValid = true;
                    const title = token?.symbol ? `SOL/${token.symbol}` : undefined;
                    farmPools.push({ address: poolInfo.poolId, tokenA: kSonicAddress, tokenB: tokenCa, title: title });
                }
            }
        }

        if (!isValid){
            await BotManager.reply(ctx, '🔴 Invalid token CA. Please, try again.\n\n<b>Token CA must be a valid address and have a liquidity pool</b>');
            return undefined;
        }
        await UserManager.updateTelegramState(user.id, undefined);
        
        const replyMessage = await BotFarmHelper.buildFarmDexMessage(user, undefined, tokenCa, farmPools);
        return replyMessage;
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
            { id: 'farm|token', text: '🔥 Token volume' },
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

    static async buildFarmDexMessage(user: IUser, farm?: IFarm, mint?: string, pools?: IFarmPool[]): Promise<Message> {
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
            farm.mint = mint;
            farm.progress = {
                currentVolume: 0,
                processingVolume: 0,
                buysInARow: 0,
                maxBuysInARow: 0,
            };
            farm.failedSwapsCount = 0;

            //TODO: hardcoded pools for SOL/USDT on SonicSVM
            farm.pools = pools || [
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

        let text = '⛏️ Create a farm';
        text += '\n\n';
        text += 'Select a DEX, frequency and expected volume.'
        text += '\n\n';
        if (farm.mint){
            text += `CA: <code>${farm.mint}</code>`;
            text += '\n\n';
        }

        text += '👇 When you\'re ready, click “Continue” to start the bot.';

        return {
            text,
            buttons,
            markup
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
                const farmTitle = farm.title || `Farm #${farm.id}`;
                text += '\n\n';
                text += `<b>${farmTitle}</b>`;
                text += `\nConfirmed volume: $${farm.progress?.currentVolume.toFixed(2)}`;
                text += `\nProcessing volume: $${farm.progress?.processingVolume.toFixed(2)}`;
                text += `\nStatus: ${farm.status}`;
            }    
        }
        
        const buttons: InlineButton[] = [];
        buttons.push({ id: `farm|my_farms|refresh`, text: '↻ Refresh' });
        buttons.push({ id: `delete_message`, text: '✕ Close' });

        for (const farm of farms) {
            const farmTitle = farm.title || `Farm #${farm.id}`;

            buttons.push({ id: 'row', text: '' });
            buttons.push({ id: `farm|${farm.id}`, text: farmTitle });
        }
        
        return { text: text, buttons: buttons, markup: BotManager.buildInlineKeyboard(buttons) };
    }

    static async buildMyFarmMessage(user: IUser, farmId: string): Promise<Message> {
        const farm = await Farm.findById(farmId);
        if (!farm || farm.userId != user.id ){
            return { text: '🟡 Farm not found' };
        }

        const traderProfile = await TraderProfilesManager.getUserTraderProfile(user.id, farm.traderProfileId);
        if (!traderProfile){
            return { text: '🟡 Trader profile not found' };
        }

        const farmTitle = farm.title || `Farm #${farm.id}`;
        const kSOL = getNativeToken(farm.chain);

        let text = `⛏️ <b>${farmTitle}</b>\n`;

        text += `\nChain: ${ChainManager.getChainTitle(farm.chain)}`;
        text += `\nDEX: ${BotFarmHelper.DEXES[farm.chain].find(d => d.id == farm.dexId)?.name || 'Unknown'}`;
        text += `\nTrader profile: ${traderProfile.title}`;
        text += `\nFrequency: ${BotFarmHelper.FREQUENCIES.find(f => f?.seconds == farm.frequency)?.title || `${farm.frequency}s`}`;
        text += `\nExpected volume: $${farm.volume}`;
        text += `\n`;

        text += `\nConfirmed volume: $${farm.progress?.currentVolume.toFixed(2)}`;
        text += `\nProcessing volume: $${farm.progress?.processingVolume.toFixed(2)}`;
        const swapsCount = await Swap.countDocuments({ farmId: farmId });
        text += `\nSwaps count: ${swapsCount}`;
        text += `\nStatus: ${farm.status}`;

        text += `\n\n`;
        if (traderProfile.encryptedWallet?.publicKey){
            text += `Wallet: <a href="${ExplorerManager.getUrlToAddress(farm.chain, traderProfile.encryptedWallet.publicKey)}">${traderProfile.encryptedWallet.publicKey}</a>\n`;
        }
        if (traderProfile.encryptedWallet?.publicKey){
            const solBalance = await SolanaManager.getWalletSolBalance(farm.chain, traderProfile.encryptedWallet?.publicKey);
            text += `Balance:\n• ${solBalance?.uiAmount || 0} ${kSOL.symbol}\n`;
            const mints = farm.pools.map(p => p.tokenB);
            const balances = await SolanaManager.getWalletTokensBalances(farm.chain, traderProfile.encryptedWallet.publicKey);
            for (const balance of balances){
                if (mints.includes(balance.mint)){
                    text += `• ${balance.balance.uiAmount || 0} ${balance.symbol}\n`;
                }
            }
        }

        const buttons: InlineButton[] = [];
        buttons.push({ id: `my_farm|${farmId}|refresh`, text: '↻ Refresh' });

        if (farm.status == FarmStatus.ACTIVE){
            buttons.push({ id: `my_farm|${farmId}|pause`, text: '⏸️ Pause farm' });
        }
        else if (farm.status == FarmStatus.PAUSED){
            buttons.push({ id: `my_farm|${farmId}|resume`, text: '▶️ Resume farm' });
        }
        buttons.push({ id: `my_farm|${farmId}|delete`, text: '🗑️ Delete farm' });
        
        return { text: text, buttons: buttons, markup: BotManager.buildInlineKeyboard(buttons) };
    }

    async refreshMyFarm(ctx: Context, user: IUser, farmId: string) {
        const replyMessage = await BotFarmHelper.buildMyFarmMessage(user, farmId);
        await BotManager.editMessage(ctx, replyMessage.text, replyMessage.markup, BotManager.getMessageIdFromContext(ctx));
    }

    async deleteMyFarm(ctx: Context, user: IUser, farmId: string) {
        await Farm.updateOne({ _id: farmId }, { status: FarmStatus.COMPLETED });
        await BotManager.deleteMessage(ctx);
    }

    async pauseMyFarm(ctx: Context, user: IUser, farmId: string) {
        await Farm.updateOne({ _id: farmId, status: FarmStatus.ACTIVE }, { status: FarmStatus.PAUSED });
        await this.refreshMyFarm(ctx, user, farmId);
    }

    async resumeMyFarm(ctx: Context, user: IUser, farmId: string) {
        await Farm.updateOne({ _id: farmId, status: FarmStatus.PAUSED }, { status: FarmStatus.ACTIVE });
        await this.refreshMyFarm(ctx, user, farmId);
    }

}