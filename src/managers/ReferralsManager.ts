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
import { TraderProfilesManager } from "./TraderProfilesManager";
import { UserRefPayout } from "../entities/referrals/UserRefPayout";
import { StatusType } from "../entities/payments/Swap";
import { SolanaManager } from "../services/solana/SolanaManager";
import { web3 } from "@coral-xyz/anchor";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { newConnectionByChain } from "../services/solana/lib/solana";
import { getNativeToken } from "../services/solana/Constants";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

//TODO: SVM

export class ReferralsManager {

    static kMinReferralPayout = 0.005; // in SOL

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
        // replace all - with _
        code = code.replaceAll('-', '_');

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
        if (code.includes('-')){
            return false;
        }
        if (code.includes(' ')){
            return false;
        }
        if (code.includes('@')){
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

    static async recalcRefStats(forceOneMonth = false){
        // get unique userId from UserRefReward during last two hours

        let usersIds: string[] = [];

        let time = 1000 * 60 * 60 * 2; // two hours
        if (forceOneMonth){
            time = 1000 * 60 * 60 * 24 * 30; // one month
        }

        const tmpUsersIds1 = await UserRefReward.distinct('userId', { createdAt: { $gte: new Date(Date.now() - time) } });
        if (tmpUsersIds1.length == 0){
            LogManager.log('ReferralsManager', 'recalcRefStats', 'No users to recalc (UserRefReward)');
            // return;
        }
        usersIds.push(...tmpUsersIds1);

        const tmpUsersIds2 = await UserRefPayout.distinct('userId', { createdAt: { $gte: new Date(Date.now() - time) } });
        if (tmpUsersIds2.length == 0){
            LogManager.log('ReferralsManager', 'recalcRefStats', 'No users to recalc (UserRefPayout)');
            // return;
        }
        usersIds.push(...tmpUsersIds2);
        // remove duplicates
        usersIds = [...new Set(usersIds)];
        LogManager.log('Recalculating ref stats for', usersIds.length, 'users:', usersIds);

        if (usersIds.length == 0){
            LogManager.log('ReferralsManager', 'recalcRefStats', 'No users to recalc');
            return;
        }

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

                //TODO: calc referral rewards for all chains. notice that for svmBNB it should be BNB, for soonBase it should be Base
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

            LogManager.log(chain, userId, 'refStats:', refStats);
            LogManager.log(chain, userId, 'rewards:', rewards);

            // rewards[0] is the total rewards
            if (rewards.length > 0){
                const reward = rewards[0];
                refStats.rewards[chain].rewardsTotal.sol = reward.sol;
                refStats.rewards[chain].rewardsTotal.usdc = reward.usdc;
            }
            else {
                refStats.rewards[chain].rewardsTotal.sol = 0;
                refStats.rewards[chain].rewardsTotal.usdc = 0;
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

            LogManager.log(chain, userId, 'payouts:', payouts);
            // payouts[0] is the total payouts
            if (payouts.length > 0){
                const payout = payouts[0];
                refStats.rewards[chain].rewardsPaid.sol = payout.sol;
                refStats.rewards[chain].rewardsPaid.usdc = payout.usdc;
            }
            else {
                refStats.rewards[chain].rewardsPaid.sol = 0;
                refStats.rewards[chain].rewardsPaid.usdc = 0;
            }
            // else {
            //     LogManager.error('ReferralsManager', 'recalcUserRefStats', 'Aggregation of UserRefPayout for user:', userId, 'went wrong');
            //     SystemNotificationsManager.sendSystemMessage('Aggregation of UserRefPayout for user: ' + userId + ' went wrong on ' + chain);
            //     // return undefined;
            // }
        }

        await UserRefStats.updateOne({ userId: userId }, { $set: { stats: refStats } });

        return refStats;
    }

    static async processRefPayouts(){
        const config = await ConfigManager.getConfig();
        if (!config.isRefPayoutsEnabled){
            LogManager.error('Ref payouts are disabled');
            SystemNotificationsManager.sendSystemMessage('🔴 Ref payouts are disabled');
            return;
        }

        const allGood = await this.checkIfFeeWalletHasEnoughUnpaidFunds();
        if (!allGood){
            LogManager.error('ReferralsManager', 'processRefPayouts', 'Fee wallet has not enough funds');
            SystemNotificationsManager.sendSystemMessage('🔴🔴🔴 Fee wallet has not enough funds to cover all unpaid referral fees');
            return;
        }

        //TODO: for now it's ok, but in the future let's make if different for each chain
        const minLamports = this.kMinReferralPayout * LAMPORTS_PER_SOL;

        const refStatsSolana = await UserRefStats.find({ 'stats.rewards.sol.rewardsTotal.sol': { $gte: minLamports } });
        for (const refStat of refStatsSolana) {
            await this.processUserRefPayout(Chain.SOLANA, refStat.userId);           
        }

        const refStatsSonic = await UserRefStats.find({ 'stats.rewards.sol.rewardsTotal.sol': { $gte: minLamports } });
        for (const refStat of refStatsSonic) {
            await this.processUserRefPayout(Chain.SONIC, refStat.userId);           
        }
    }

    static async checkIfFeeWalletHasEnoughUnpaidFunds(): Promise<boolean> {
        const feeWalletPublicKey = new web3.PublicKey(process.env.FEE_SOL_WALLET_ADDRESS!)


        const chains = [Chain.SOLANA, Chain.SONIC];
        for (const chain of chains){
            const connection = newConnectionByChain(chain);
            const balance = await connection.getBalance(feeWalletPublicKey);
            const refStats = await UserRefStats.find();
            const kSOL = getNativeToken(chain);
            const solUpaid = refStats.reduce((acc, refStat) => {
                LogManager.log(chain, 'refStat:', refStat);
                return acc + (refStat.stats.rewards[chain]?.rewardsTotal?.sol || 0) - (refStat.stats.rewards[chain]?.rewardsPaid?.sol || 0);
            }, 0);

            LogManager.log('checkIfFeeWalletHasEnoughUnpaidFunds', 'chain:', chain, 'balance:', balance, 'solUpaid:', solUpaid);

            if (balance < solUpaid){
                LogManager.error('ReferralsManager', 'checkIfFeeWalletHasEnoughUnpaidFunds', 'Fee wallet has not enough funds', { chain, balance, solUpaid });
                SystemNotificationsManager.sendSystemMessage(`🔴🔴🔴 Fee wallet has not enough funds to cover all unpaid referral fees.\nBalance: ${balance}\nUnpaid (${kSOL.symbol}): ${solUpaid}`);
                await ConfigManager.updateConfig({ isRefPayoutsEnabled: false });
                return false;
            }

            //TODO: check USDC unpaid
        }
        return true;
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
        LogManager.log('unpaid:', unpaid / getNativeToken(chain).lamportsPerSol, getNativeToken(chain).symbol);
        if (unpaid < this.kMinReferralPayout * getNativeToken(chain).lamportsPerSol){
            LogManager.log(`unpaid is less than ${this.kMinReferralPayout} SOL`);
            return;
        }

        // add to UserRefPayout
        const traderProfile = await TraderProfilesManager.getUserDefaultTraderProfile(userId);
        if (!traderProfile){
            LogManager.log('Trader profile not found for user:', userId);
            return;
        }
        if (!traderProfile.encryptedWallet?.publicKey){
            LogManager.log('Trader profile wallet not found for user:', userId);
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
        // LogManager.log('UserRefPayout created:', payout);

        // calc amount again, if it doesn't exceed the expected amount
        const refStatsUpdated = await this.recalcUserRefStats(userId);
        // LogManager.log('refStatsUpdated:', refStatsUpdated);
        if (!refStatsUpdated || refStatsUpdated.rewards[chain].rewardsTotal.sol < refStatsUpdated.rewards[chain].rewardsPaid.sol){
            // remove CREATED payout. Don't proceed the payment.
            await UserRefPayout.updateMany({ userId: userId, 'status.type': StatusType.CREATED }, { $set: { 'status.type': StatusType.CANCELLED } });
            LogManager.log('Unpaid amount is less than expected. Payout removed.');
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

                const tx = await SolanaManager.createVersionedTransaction(chain, ixs, feeKeypair, undefined, undefined, false);
                const connection = newConnectionByChain(chain);
                const signature = await connection.sendTransaction(tx);
                LogManager.log('UserRefPayout', 'userId:', userId, 'chain:', chain, 'signature:', signature);
                await UserRefPayout.updateOne({ _id: payout._id }, { $set: { 'status.type': StatusType.PROCESSING, 'status.tx.signature': signature } });
            }
        }
        catch (error) {
            LogManager.error('Error while sending user payout transaction:', error);
            SystemNotificationsManager.sendSystemMessage('ReferralsManager: processUserRefPayout: Error while sending transaction for user: ' + userId + ' - ' + error);
            await UserRefPayout.updateOne({ _id: payout._id }, { $set: { 'status.type': StatusType.CANCELLED } });
            return;
        }

        //TODO: add USDC ref payouts
    }

    static async receivedConfirmationForSignature(chain: Chain, signature: string) {
        const refPayout = await UserRefPayout.findOne({ chain: chain, 'status.tx.signature': signature });
        if (!refPayout) {
            return;
        }

        const now = new Date();

        refPayout.status.type = StatusType.COMPLETED;
        if (refPayout.status.tx && refPayout.status.tx.signature == signature) {
            refPayout.status.tx.confirmedAt = new Date();
        }

        await UserRefPayout.updateOne({ _id: refPayout._id, "status.type": {$ne: StatusType.COMPLETED} }, { $set: { status: refPayout.status } });
    }

    static async checkPendingRefPayouts() {
        const refPayouts = await UserRefPayout.find({ "status.type": StatusType.PROCESSING });
        LogManager.log('ReferralsManager', 'checkPendingRefPayouts', 'Pending ref payouts:', refPayouts.length);
        if (!refPayouts || refPayouts.length === 0) {
            return;
        }

        const chainValues = Object.values(Chain); 
        for (const chain of chainValues) {
            const blockhashes: string[] = [];

            const signatures = refPayouts.map(payout => payout.chain == chain && payout.status.tx?.signature).filter(signature => signature) as string[];

            if (signatures.length === 0) {
                continue;
            }

            const connection = newConnectionByChain(chain);
            const signatureStatuses = await connection.getSignatureStatuses(signatures);

            for (let index = 0; index < signatures.length; index++) {
                const signature = signatures[index];
                const signatureStatus = signatureStatuses.value[index];
                const refPayout = refPayouts.find(payout => payout.status.tx?.signature == signature);
                if (!refPayout) {
                    LogManager.error('ReferralsManager', 'checkPendingRefPayouts', 'Ref payout not found', { signature });
                    continue;
                }
    
                if (!signatureStatus) {
                    if (refPayout.status.tx && refPayout.status.tx.blockhash) {
                        if (!blockhashes.includes(refPayout.status.tx.blockhash)) {
                            blockhashes.push(refPayout.status.tx.blockhash);
                        }
                    }
                    continue;
                }
                else {
                    if (signatureStatus.err) {
                        LogManager.error('ReferralsManager', 'checkPendingRefPayouts', signatureStatus.err);
                        refPayout.status.type = StatusType.CANCELLED;
                        await UserRefPayout.updateOne({ _id: refPayout._id }, { $set: { status: refPayout.status } });
                        continue;
                    }
                    else if (signatureStatus.confirmationStatus === 'confirmed' || signatureStatus.confirmationStatus === 'finalized') {
                        // should I do anything here? I think at this moment ref payout is already confirmed from geyser. 
                        // maybe I should add this tx to geyser, just in case it's missed?
    
                        refPayout.status.type = StatusType.COMPLETED;
                        refPayout.status.tx!.confirmedAt = new Date();
                        await UserRefPayout.updateOne({ _id: refPayout._id, 'status.type': {$ne: StatusType.COMPLETED} }, { $set: { status: refPayout.status } });
                    }
                }
            }
    
            // fetch blockhashes statusses
            for (const blockhash of blockhashes) {
                const isValid = await SolanaManager.isBlockhashValid(blockhash, chain);
                if (isValid) {
                    continue;
                }
                else if (isValid == false){
                    // then set status from PENDING to CREATED 
                    for (const refPayout of refPayouts) {
                        if (refPayout.chain == chain &&  refPayout.status.tx?.blockhash == blockhash && refPayout.status.type == StatusType.PROCESSING) {
                            refPayout.status.type = StatusType.CANCELLED;
                            await UserRefPayout.updateOne({ _id: refPayout._id, 'status.type': StatusType.PROCESSING }, { $set: { status: refPayout.status } });
                        }
                    }
                }
                else if (isValid == undefined){
                    LogManager.error('ReferralsManager', 'checkPendingRefPayouts', 'Blockhash is undefined', { blockhash });
                    // is this the same as isValid == false ??
                }
            }
        }
    }

}