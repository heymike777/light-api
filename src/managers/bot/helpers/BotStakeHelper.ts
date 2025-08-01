import { Context } from "grammy";
import { UserManager } from "../../UserManager";
import { BotHelper, Message } from "./BotHelper";
import { IUser, TelegramWaitingType } from "../../../entities/users/User";
import { BotManager } from "../BotManager";
import { TraderProfilesManager } from "../../TraderProfilesManager";
import { LogManager } from "../../LogManager";
import { Chain } from "../../../services/solana/types";
import { ChaosManager } from "../../../services/solana/svm/ChaosManager";
import { TokenManager } from "../../TokenManager";
import { TgMessage } from "../BotTypes";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { Keypair } from "@solana/web3.js";

export class BotStakeHelper extends BotHelper {

    constructor() {
        const replyMessage: Message = {
            text: 'Enter a token symbol or address to stake'
        };

        super('stake', replyMessage);
    }

    async commandReceived(ctx: Context, user: IUser) {
        await UserManager.updateTelegramState(user.id, undefined);

        const buttonId = ctx.update?.callback_query?.data;

        if (buttonId && buttonId.startsWith('stake|')){
            const parts = buttonId.split('|');
            if (parts.length == 3){
                const chain = parts[1] as Chain;
                const mint: string = parts[2];

                const traderProfile = await TraderProfilesManager.getUserDefaultTraderProfile(user.id);
                if (!traderProfile){
                    await BotManager.reply(ctx, '🟡 Please, create a trader profile first');
                    return;
                }

                const token = await TokenManager.getToken(chain, mint);
                await BotManager.reply(ctx, `How much ${token?.symbol || mint} do you want to stake?`);
                await UserManager.updateTelegramState(user.id, { waitingFor: TelegramWaitingType.STAKE_AMOUNT, helper: this.kCommand, data: { chain, mint } });
                // const chaos = await ChaosManager.init(user.getWallet().keypair);
            }
            else {
                LogManager.error('Invalid buttonId:', buttonId);
            }
        }
    }

    async messageReceived(message: TgMessage, ctx: Context, user: IUser): Promise<boolean> {
        LogManager.log('BotFarmHelper', 'messageReceived', message.text);

        super.messageReceived(message, ctx, user);

        if (user.telegramState?.waitingFor == TelegramWaitingType.STAKE_AMOUNT){
            const amountString = message.text.trim().replaceAll(',', '.');
            const amount = parseFloat(amountString);
            const chain = user.telegramState.data.chain;
            const mint = user.telegramState.data.mint;

            const stakeToken = ChaosManager.kSupportedTokens[mint];
            if (isNaN(amount) || amount < stakeToken.minStakeAmount){
                await BotManager.reply(ctx, `🔴 Minimum stake amount is ${stakeToken.minStakeAmount} ${stakeToken.symbol}`);
                return true;
            }

            const token = await TokenManager.getToken(chain, mint);
            if (!token){
                await BotManager.reply(ctx, '🔴 Token not found');
                return true;
            }

            const traderProfile = await TraderProfilesManager.getUserDefaultTraderProfile(user.id);
            const privateKey = traderProfile?.getWallet()?.privateKey;
            if (!privateKey){
                await BotManager.reply(ctx, '🔴 Trader profile not found. Please, create a trader profile first');
                return true;
            }

            try {
                const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
                await ChaosManager.stake(keypair, mint, amount);
            }
            catch (error: any){
                await BotManager.reply(ctx, `🔴 ${error.message}`);
                return true;
            }

            await UserManager.updateTelegramState(user.id, undefined);
            return true;
        }

        return false;
    }


}