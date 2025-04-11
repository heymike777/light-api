import { IUser, User } from "../entities/users/User";
import { UserRefClaim } from "../entities/referrals/UserRefClaim";
import { UserRefCode } from "../entities/referrals/UserRefCode";
import { Helpers } from "../services/helpers/Helpers";
import { LogManager } from "./LogManager";
import { RefStats, UserRefStats } from "../entities/referrals/UserRefStats";
import { ConfigManager } from "./ConfigManager";
import { SystemNotificationsManager } from "./SytemNotificationsManager";
import { UserRefReward } from "../entities/referrals/UserRefReward";
import { Currency } from "../models/types";
import { Chain, Priority } from "../services/solana/types";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TraderProfilesManager } from "./TraderProfilesManager";
import { UserRefPayout } from "../entities/referrals/UserRefPayout";
import { StatusType } from "../entities/payments/Swap";
import { SolanaManager } from "../services/solana/SolanaManager";
import { web3 } from "@coral-xyz/anchor";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { newConnectionByChain } from "../services/solana/lib/solana";

export class ReferralsManager {

    static async claimRefCode(user: IUser, referralCode: string, throwError: boolean = true) {
        const now = new Date();
        LogManager.log('claimRefCode', 'user:', user.id, 'referralCode:', referralCode);

        // if (user.parent && user.parent.createdAt && user.parent.createdAt.getTime() > now.getTime() - 7 * 24 * 60 * 60 * 1000){
        //     LogManager.log('BotStartHelper', 'start', 'user already have parent');
        //     if (throwError){
        //         throw new Error('You can update your referral code only once a week');
        //     }
        // }

        LogManager.log('claimRefCode', 'user:', user.id, 'user.parent:', user.parent);
        if (user.parent){
            LogManager.log('BotStartHelper', 'start', 'user already have parent');
            if (throwError){
                throw new Error('You have already used referral code');
            }
        }
        else {
            const parentUserId = await this.findUserByReferralCode(referralCode);
            if (!parentUserId){
                LogManager.log('BotStartHelper', 'start', 'referral code not found');
                if (throwError){
                    throw new Error('Referral code not found');
                }
                return;
            }
            if (parentUserId == user.id){
                LogManager.log('BotStartHelper', 'start', 'user cannot use his own referral code');
                if (throwError){
                    throw new Error('You cannot use your own referral code');
                }
                return;
            }

            user.parent = {
                userId: parentUserId,
                referralCode: referralCode,
                createdAt: now
            };

            await User.updateOne({ _id: user._id }, {
                $set: {
                    parent: user.parent,
                }
            });

            await UserRefClaim.create({
                userId: user.id,
                referralCode: referralCode,
                parentUserId: parentUserId,
                claimedAt: new Date()
            });
        }
    }

    static async findUserByReferralCode(referralCode: string): Promise<string | undefined> {
        const refCode = await UserRefCode.findOne({ code: referralCode, active: true });
        return refCode?.userId;
    }

    static async createReferralCode(user: IUser, shouldSaveToUser = true): Promise<string> {
        let code = user.telegram?.username || Helpers.makeid(8);
        let triesLeft = 50;
        while (true){
            const existing = await UserRefCode.findOne({ code: code, active: true });
            if (!existing){
                break;
            }

            code = Helpers.makeid(8);
            triesLeft--;
            if (triesLeft <= 0){
                throw new Error('Could not generate referral code');
            }
        }

        const refCode = new UserRefCode({
            userId: user.id,
            code: code,
            active: true
        });
        await refCode.save();

        if (shouldSaveToUser || !user.referralCode){
            user.referralCode = code;
            await User.updateOne({ _id: user._id }, {
                $set: {
                    referralCode: code,
                }
            });
        }

        return code;
    }

    static async saveReferralCode(user: IUser, code: string) {
        const existing = await UserRefCode.findOne({ code: code, active: true });
        if (existing){
            throw new Error('Referral code already exists');
        }

        const refCode = new UserRefCode({
            userId: user.id,
            code: code,
            active: true
        });
        await refCode.save();

        if (!user.referralCode){
            user.referralCode = code;
            await User.updateOne({ _id: user._id }, {
                $set: {
                    referralCode: code,
                }
            });
        }

        return code;
    }

    static async isValidReferralCode(code: string): Promise<boolean> {
        if (code.length < 3){
            return false;
        }
        if (code.length > 20){
            return false;
        }

        if (code.includes(' ')){
            return false;
        }
        // refcodes should contains only letters, numbers, '-', '_'
        if (!/^[a-zA-Z0-9-_]+$/.test(code)){
            return false;
        }
        
        // check if code already exists
        const existing = await UserRefCode.findOne({ code: code, active: true });
        if (existing){
            return false;
        }

        return true;
    }

    static async fetchUserRefStats(userId: string): Promise<RefStats | undefined> {
        const userRefStats = await UserRefStats.findOne({ userId: userId });
        return userRefStats?.stats;
    }

    static async recalcRefStats(){
        // get unique userId from UserRefReward during last two hours
        const usersIds = await UserRefReward.distinct('userId', { createdAt: { $gte: new Date(Date.now() - 1000 * 60 * 60 * 2) } });
        if (usersIds.length == 0){
            LogManager.log('ReferralsManager', 'recalcRefStats', 'No users to recalc');
            return;
        }
        
        console.log('Recalculating ref stats for', usersIds.length, 'users:', usersIds);
        for (const userId of usersIds){
            await this.recalcUserRefStats(userId);
        }
    }

    static async recalcUserRefStats(userId: string): Promise<RefStats | undefined> {
        let userRefStats = await UserRefStats.findOne({ userId: userId });
        if (!userRefStats){
            userRefStats = new UserRefStats();
            userRefStats.userId = userId;
            userRefStats.createdAt = new Date();
            userRefStats.stats = {
                usersCount: {
                    direct: 0,
                    indirect: 0
                },
                rewards: {
                    'sol': {
                        rewardsTotal: {
                            sol: 0,
                            usdc: 0
                        },
                        rewardsPaid: {
                            sol: 0,
                            usdc: 0
                        },
                    },
                    'sonic': {
                        rewardsTotal: {
                            sol: 0,
                            usdc: 0
                        },
                        rewardsPaid: {
                            sol: 0,
                            usdc: 0
                        },
                    }
                }
            };
            await userRefStats.save();
        } 

        const refStats = userRefStats.stats;

        // calculate ref stats - usersCount
        let refUsers = await User.find({ 'parent.userId': userId });
        refStats.usersCount.direct = refUsers.length;
        refStats.usersCount.indirect = 0;

        // 4 levels of referrals
        for (let index = 0; index < 4; index++) {
            if (refUsers.length > 0){
                const refUsersIds = refUsers.map((user) => user.id);            
                const newRefUsers = await User.find({ 'parent.userId': { $in: refUsersIds } });
                refStats.usersCount.indirect += newRefUsers.length;
                refUsers = newRefUsers; 
            }     
        }

        const chains = [Chain.SOLANA, Chain.SONIC];
        for (const chain of chains){
            // calculate ref stats - rewardsTotal and rewardsPaid
            const rewards = await UserRefReward.aggregate([
                { $match: { userId: userId, chain: chain } },
                { 
                    $group: { 
                        _id: null, 
                        usd: { $sum: '$usdAmount' }, 
                        sol: { $sum: { $cond: [{ $eq: ['$currency', Currency.SOL] }, '$amount', 0] } }, 
                        usdc: { $sum: { $cond: [{ $eq: ['$currency', Currency.USDC] }, '$amount', 0] } } 
                    }
                },
            ]);

            console.log(chain, 'refStats:', refStats);
            console.log(chain, 'rewards:', rewards);

            // rewards[0] is the total rewards
            if (rewards.length > 0){
                const reward = rewards[0];
                refStats.rewards[chain].rewardsTotal.sol = reward.sol;
                refStats.rewards[chain].rewardsTotal.usdc = reward.usdc;
            }

            const payouts = await UserRefPayout.aggregate([
                { $match: { userId: userId, chain: chain, 'status.type': { $ne: StatusType.CANCELLED } } },
                { 
                    $group: { 
                        _id: null, 
                        sol: { $sum: { $cond: [{ $eq: ['$currency', Currency.SOL] }, '$amount', 0] } }, 
                        usdc: { $sum: { $cond: [{ $eq: ['$currency', Currency.USDC] }, '$amount', 0] } } 
                    }
                },
            ]);

            console.log('payouts:', payouts);
            // payouts[0] is the total payouts
            if (payouts.length > 0){
                const payout = payouts[0];
                refStats.rewards[chain].rewardsPaid.sol = payout.sol;
                refStats.rewards[chain].rewardsPaid.usdc = payout.usdc;
            }
            else {
                LogManager.error('ReferralsManager', 'recalcUserRefStats', 'Aggregation of UserRefPayout for user:', userId, 'went wrong');
                SystemNotificationsManager.sendSystemMessage('Aggregation of UserRefPayout for user: ' + userId + ' went wrong');
                // return undefined;
            }
        }

        await UserRefStats.updateOne({ userId: userId }, { $set: { stats: refStats } });

        return refStats;
    }

    static async processRefPayouts(){
        const config = await ConfigManager.getConfig();
        if (!config.isRefPayoutsEnabled){
            LogManager.error('Ref payouts are disabled');
            SystemNotificationsManager.sendSystemMessage('Ref payouts are disabled');
            return;
        }

        const minLamports = 0.005 * LAMPORTS_PER_SOL;

        const refStatsSolana = await UserRefStats.find({ 'stats.rewards.sol.rewardsTotal.sol': { $gte: minLamports } });
        for (const refStat of refStatsSolana) {
            await this.processUserRefPayout(Chain.SOLANA, refStat.userId);           
        }

        const refStatsSonic = await UserRefStats.find({ 'stats.rewards.sol.rewardsTotal.sol': { $gte: minLamports } });
        for (const refStat of refStatsSonic) {
            await this.processUserRefPayout(Chain.SONIC, refStat.userId);           
        }
    }

    static async processUserRefPayout(chain: Chain, userId: string){
        if (chain != Chain.SOLANA){
            LogManager.error('ReferralsManager', 'processUserRefPayout', 'Chain is not supported', { chain });
            return;
        }

        // calc amount to pay
        const refStats = await this.recalcUserRefStats(userId);
        if (!refStats){
            SystemNotificationsManager.sendSystemMessage('ReferralsManager: processUserRefPayout: refStats is undefined for user: ' + userId);
            return;
        }
        const unpaid = refStats.rewards[chain].rewardsTotal.sol - refStats.rewards[chain].rewardsPaid.sol;
        console.log('unpaid:', unpaid / LAMPORTS_PER_SOL, 'SOL');
        if (unpaid < 0.005){
            console.log('unpaid is less than 0.005 SOL');
            return;
        }

        // add to UserRefPayout
        const traderProfile = await TraderProfilesManager.getUserDefaultTraderProfile(userId);
        if (!traderProfile){
            console.log('Trader profile not found for user:', userId);
            return;
        }
        if (!traderProfile.encryptedWallet?.publicKey){
            console.log('Trader profile wallet not found for user:', userId);
            return;
        }
        const payout = new UserRefPayout();
        payout.userId = userId;
        payout.traderProfileId = traderProfile.id;
        payout.chain = chain;
        payout.amount = unpaid;
        payout.currency = Currency.SOL;
        payout.createdAt = new Date();
        payout.status = {
            type: StatusType.CREATED,
        };
        await payout.save();
        console.log('UserRefPayout created:', payout);

        // calc amount again, if it doesn't exceed the expected amount
        const refStatsUpdated = await this.recalcUserRefStats(userId);
        console.log('refStatsUpdated:', refStatsUpdated);
        if (!refStatsUpdated || refStatsUpdated.rewards[chain].rewardsTotal.sol < refStatsUpdated.rewards[chain].rewardsPaid.sol){
            // remove CREATED payout. Don't proceed the payment.
            await UserRefPayout.updateMany({ userId: userId, 'status.type': StatusType.CREATED }, { $set: { 'status.type': StatusType.CANCELLED } });
            console.log('Unpaid amount is less than expected. Payout removed.');
            SystemNotificationsManager.sendSystemMessage('ReferralsManager: processUserRefPayout: refStatsUpdated is wrong for user: ' + userId + '- Canceling the payout.');
            return;
        }

        // pay the user
        try {
            const feeKeypair = web3.Keypair.fromSecretKey(bs58.decode(process.env.FEE_SOL_PRIVATE_KEY!));
            if (payout.currency == Currency.SOL){
                const ixs: web3.TransactionInstruction[] = [
                    ...(await SolanaManager.getPriorityFeeInstructions(Priority.LOW)),
                    await SolanaManager.createSolTransferInstruction(feeKeypair.publicKey, new web3.PublicKey(traderProfile.encryptedWallet?.publicKey), payout.amount),
                ];

                const tx = await SolanaManager.createVersionedTransaction(chain, ixs, feeKeypair);
                const connection = newConnectionByChain(chain);
                const signature = await connection.sendTransaction(tx);
                console.log('UserRefPayout', 'userId:', userId, 'chain:', chain, 'signature:', signature);
                await UserRefPayout.updateOne({ _id: payout._id }, { $set: { 'status.type': StatusType.PROCESSING, 'status.tx.signature': signature } });
            }
        }
        catch (error) {
            console.error('Error while sending user payout transaction:', error);
            SystemNotificationsManager.sendSystemMessage('ReferralsManager: processUserRefPayout: Error while sending transaction for user: ' + userId + ' - ' + error);
            return;
        }

        //TODO: add USDC ref payouts
    }

    static async receivedConfirmationForSignature(chain: Chain, signature: string) {
        // const swap = await Swap.findOne({ chain: chain, "status.tx.signature": signature });
        // if (!swap) {
        //     // LogManager.error('SwapManager', 'receivedConfirmation', 'Swap not found', { signature });
        //     return;
        // }

        // const now = new Date();

        // //TODO: set into SWAP how many SOL & Tokens I spent / reveived. I need it for P&L calculations

        // swap.status.type = StatusType.COMPLETED;
        // if (swap.status.tx && swap.status.tx.signature == signature) {
        //     swap.status.tx.confirmedAt = new Date();
        // }

        // if (swap.status.txs){
        //     for (const tx of swap.status.txs) {
        //         if (tx.signature == signature) {
        //             tx.confirmedAt = now;
        //         }
        //     }
        // }

        // const updateResult = await Swap.updateOne({ _id: swap._id, "status.type": {$ne: StatusType.COMPLETED} }, { $set: { status: swap.status } });
        // if (updateResult.modifiedCount > 0){
        //     await this.saveReferralRewards(swap, signature, parsedTransactionWithMeta);
        //     this.trackSwapInMixpanel(swap);    
        // }
        // else {
        //     LogManager.error('SwapManager', 'receivedConfirmation', 'Swap not updated', `modifiedCount = ${updateResult.modifiedCount}`, 'swap:', { swap });
        // }
    }

    static async checkPendingRefPayouts() {
        //TODO: similar to checkPendingSwaps
    }

}