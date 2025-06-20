import { ITradingEvent, TradingEvent, TradingEventStatus } from "../entities/events/TradingEvent";
import { TradingEventPoints } from "../entities/events/TradingEventPoints";
import { StatusType, Swap } from "../entities/payments/Swap";
import { IUserTraderProfile, UserTraderProfile } from "../entities/users/TraderProfile";
import { IUser } from "../entities/users/User";
import { Chain } from "../services/solana/types";
import { TraderProfilesManager } from "./TraderProfilesManager";

export class EventsManager {

    static async getActiveEvent(onlyActive: boolean = false): Promise<ITradingEvent | undefined> {
        const now = new Date();

        let event: ITradingEvent | null = await TradingEvent.findOne({
            status: TradingEventStatus.ACTIVE
        }).exec();

        if (event){
            return event;
        }

        if (onlyActive){
            // if onlyActive is true, return undefined if no active event is found
            return undefined;
        }
    
        // If no active event found, check for upcoming events
        event = await TradingEvent.findOne({
            status: TradingEventStatus.UPCOMING,
        }).sort({ startAt: -1 }).exec();

        if (event){
            return event;
        }

        // If no active or upcoming event found, return event that just ended less than 3 days ago
        const threeDaysAgo = new Date(now);
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        event = await TradingEvent.findOne({
            status: TradingEventStatus.COMPLETED,
            endAt: { $gte: threeDaysAgo, $lte: now },
        }).exec();

        if (event){
            return event;
        }

        // If no events found, return undefined
        return undefined;
    }

    static async getEventById(eventId: string): Promise<ITradingEvent | undefined> {
        const event = await TradingEvent.findById(eventId).exec();

        if (!event){
            return undefined;
        }

        return event;
    }

    static async createChillEvent() {
        const event = new TradingEvent();
        event.title = 'CHILL. TRADE. EARN.';
        event.startAt = new Date('2025-06-01T00:00:00Z');
        event.endAt = new Date('2025-06-20T23:59:59Z');
        event.description = `Trade $CHILL on Sonic SVM using Light and earn points to win prizes! \n\nThe more $CHILL you trade, the more points you earn.`;
        event.status = TradingEventStatus.UPCOMING;
        event.chains = [Chain.SONIC];
        event.image = 'https://light.dangervalley.com/events/chill_1.png';
        event.tradingPoints = {
            'sonic:7yt6vPUrSCxEq3cQpQ6XKynttH5MMPfT93N1AqnosyQ3': 1000, // 1000 points for each $1 traded of CHILL on Sonic SVM
            'sonic:mrujEYaN1oyQXDHeYNxBYpxWKVkQ2XsGxfznpifu4aL': 500, 
            '*': 0, // 0 points for any other token
        }
        event.tokens = [
            { mint: '7yt6vPUrSCxEq3cQpQ6XKynttH5MMPfT93N1AqnosyQ3', symbol: 'CHILL' },
            { mint: 'mrujEYaN1oyQXDHeYNxBYpxWKVkQ2XsGxfznpifu4aL', symbol: 'SONIC' }
        ];
        event.createdAt = new Date();
        await event.save();
    }

    static async createSoonEvent() {
        const eventTitle = 'SOON RUSH';
        const existingEvent = await TradingEvent.findOne({
            title: eventTitle
        });
        if (existingEvent){
            return;
        }

        const event = new TradingEvent();
        event.title = eventTitle;
        event.startAt = new Date('2025-06-20T11:00:00Z');
        event.endAt = new Date('2025-06-27T15:59:59Z');
        event.description = `Trade SOON, svmBNB, and soonBase on Light to win your share of 5,000 SOON + exclusive prizes \n\nYou should make at least $100 in volume to be eligible for the prizes. The more you trade, the more $SOON you win.\n\nIn addition, we have a few special prizes - anyone can win them, no matter how much you trade (still have to make the min $100 in volume).`;
        event.status = TradingEventStatus.UPCOMING;
        event.chains = [Chain.SOON_MAINNET, Chain.SVMBNB_MAINNET, Chain.SOONBASE_MAINNET];
        event.image = 'https://light.dangervalley.com/events/soon_rush.png';
        event.tradingPoints = {
            // 'sonic:7yt6vPUrSCxEq3cQpQ6XKynttH5MMPfT93N1AqnosyQ3': 1000, // 1000 points for each $1 traded of CHILL on Sonic SVM
            // 'sonic:mrujEYaN1oyQXDHeYNxBYpxWKVkQ2XsGxfznpifu4aL': 500, 
            '*': 1000, // 0 points for any other token
        }
        // event.tokens = [
        //     // { mint: '7yt6vPUrSCxEq3cQpQ6XKynttH5MMPfT93N1AqnosyQ3', symbol: 'CHILL' },
        //     // { mint: 'mrujEYaN1oyQXDHeYNxBYpxWKVkQ2XsGxfznpifu4aL', symbol: 'SONIC' }
        // ];
        event.special = {
            description: `We are giving away 3 <a href="https://www.tensor.trade/trade/danger_valley_ducks">Danger Valley Ducks</a> NFTs! 🦆

Here's how to win one:
1. <b>Best X Thread</b> – Share your experience with Light in an X thread, tag <a href="https://x.com/lightdotapp">@lightdotapp</a>, <a href="https://x.com/soon_svm">@soon_svm</a>, <a href="https://x.com/cobaltx_io">@cobaltx_io</a>, and <a href="https://x.com/danger_valley">@danger_valley</a>, and include your Light's referral link. The most insightful or creative post wins!
2. <b>Top Referrer</b> – Bring in the most new users to Light during the event and claim your Duck.
3. <b>Most Active Referrals</b> – The third NFT goes to the person whose referrals generate the highest trading volume during the event.

Quack!`,
            image: 'https://light.dangervalley.com/events/soon_rush_special.jpeg',
            shouldAcceptData: true,
        }
        event.createdAt = new Date();
        await event.save();
    }

    static formatDateToString(date: Date): string {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'UTC',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });

        const datePart = formatter.format(date);

        let hours = date.getUTCHours();
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';

        hours = hours % 12;
        hours = hours === 0 ? 12 : hours;

        return `${datePart} at ${hours}:${minutes} ${ampm} UTC`;
    }

    static async updateEventStatusses(){
        const now = new Date();

        const countEvents = await TradingEvent.countDocuments({
            status: { $in: [TradingEventStatus.ACTIVE, TradingEventStatus.UPCOMING] }
        });
        if (countEvents == 0){
            return; // No events to update
        }

        // Update active events to completed if they have ended
        await TradingEvent.updateMany({
            status: TradingEventStatus.ACTIVE,
            endAt: { $lt: now }
        }, { $set: { status: TradingEventStatus.COMPLETED } });

        // Update upcoming events to active if they have started
        await TradingEvent.updateMany({
            status: TradingEventStatus.UPCOMING,
            startAt: { $lt: now }
        }, { $set: { status: TradingEventStatus.ACTIVE } });
    }

    static async calculateEventPointsForTradingProfile(event: ITradingEvent, traderProfiles: IUserTraderProfile[]): Promise<{ [traderProfileId: string]: number }> {
        const ids = traderProfiles.map(tp => tp.id);
        const points = await TradingEventPoints.find({ eventId: event.id, traderProfileId: { $in: ids } });
        const result: { [traderProfileId: string]: number } = {};
        for (const point of points){
            result[point.traderProfileId] = point.points;
        }
        return result;
    }

    static async recalculateLeaderboard(eventId: string) {
        console.log('recalculateLeaderboard', eventId);

        const event = await EventsManager.getEventById(eventId);
        if (!event){
            return;
        }        

        // console.log('recalculateLeaderboard', event.title);
        
        const pipeline = [
            {
                $match: {
                    'status.type': StatusType.COMPLETED,
                    points: { $exists: true },
                    createdAt: { $gte: event.startAt, $lte: event.endAt }
                }
            },
            {
                $project: {
                    traderProfileId: 1,
                    userId: 1,
                    eventPoints: {
                        $ifNull: [
                            { $toDouble: { $getField: { field: event.id, input: '$points' } } },
                            0
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: '$traderProfileId',
                    userId: { $first: '$userId' },
                    totalPoints: { $sum: '$eventPoints' }
                }
            }
        ];

        const results = await Swap.aggregate(pipeline);
        // console.log('recalculateLeaderboard', 'results:', results);
        for (const result of results){
            const traderProfileId = result._id;
            const userId = result.userId;
            const points = result.totalPoints;

            const existingTradingEventPoints = await TradingEventPoints.findOne({ eventId: eventId, traderProfileId: traderProfileId });
            if (existingTradingEventPoints){
                if (existingTradingEventPoints.points != points){
                    await TradingEventPoints.updateOne({ _id: existingTradingEventPoints.id }, { $set: { points: points, updatedAt: new Date() } });
                }
            }
            else {
                const tradingEventPoints = new TradingEventPoints();
                tradingEventPoints.eventId = eventId;
                tradingEventPoints.userId = userId;
                tradingEventPoints.traderProfileId = traderProfileId;
                tradingEventPoints.points = points;
                await tradingEventPoints.save();
            }
        }
    }

    static async recalculateLeaderboardForActiveEvents() {
        const activeEvents = await TradingEvent.find({
            status: TradingEventStatus.ACTIVE
        });
        for (const event of activeEvents){
            await EventsManager.recalculateLeaderboard(event.id);
        }

        //recalculate leaderboard for events that ended less than 2 hours ago
        const endedEvents = await TradingEvent.find({
            status: TradingEventStatus.COMPLETED,
            endAt: { $lte: new Date(new Date().getTime() - 2 * 60 * 60 * 1000) }
        });
        for (const event of endedEvents){
            await EventsManager.recalculateLeaderboard(event.id);
        }
    }

    static async getLeaderboardForEvent(eventId: string): Promise<{ userId: string, traderProfileId: string, walletAddress: string, points: number }[]> {
        const points = await TradingEventPoints.find({ eventId: eventId }).sort({ points: -1 }).limit(20);
        const traderProfileIds = points.map(p => p.traderProfileId);
        const traderProfiles = await UserTraderProfile.find({ _id: { $in: traderProfileIds } });

        const result: { userId: string, traderProfileId: string, walletAddress: string, points: number }[] = [];
        for (const point of points){
            const traderProfile = traderProfiles.find(tp => tp.id == point.traderProfileId);
            if (traderProfile){
                result.push({ userId: point.userId, traderProfileId: point.traderProfileId, walletAddress: traderProfile.encryptedWallet?.publicKey || 'unknown', points: point.points });
            }
        }
        return result;
    }

}