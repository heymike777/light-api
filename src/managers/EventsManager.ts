import { ITradingEvent, TradingEvent, TradingEventStatus } from "../entities/events/Event";
import { StatusType, Swap } from "../entities/payments/Swap";
import { IUserTraderProfile } from "../entities/users/TraderProfile";
import { IUser } from "../entities/users/User";
import { Chain } from "../services/solana/types";

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

    static async createChillEvent() {
        const event = new TradingEvent();
        event.title = 'CHILL. TRADE. EARN.';
        event.startAt = new Date('2025-06-01T00:00:00Z');
        event.endAt = new Date('2025-06-20T23:59:59Z');
        event.description = `Trade $CHILL on Sonic SVM using Light and earn points to win prizes! \n\nThe more $CHILL you trade, the more points you earn.`;
        event.status = TradingEventStatus.UPCOMING;
        event.chain = Chain.SONIC;
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

    static async calculateEventPointsForTradingProfile(event: ITradingEvent, traderProfile: IUserTraderProfile): Promise<number> {
        const pipeline = [
            {
                $match: {
                    traderProfileId: traderProfile.id,
                    'status.type': StatusType.COMPLETED,
                    points: { $exists: true },
                    createdAt: { $gte: event.startAt, $lte: event.endAt }
                }
            },
            {
                $project: {
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
                    _id: null,
                    totalPoints: { $sum: '$eventPoints' }
                }
            }
        ];

        const result = await Swap.aggregate(pipeline);
        return result[0]?.totalPoints || 0;
    }

}