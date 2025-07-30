import express, { Request, Response } from "express";
import { EventsManager } from "../../managers/EventsManager";
import { Helpers } from "../../services/helpers/Helpers";

const router = express.Router();

router.get(
    '/api/v1/events/:eventId',
    async (req: Request, res: Response) => {
		const eventId = '' + req.params.eventId;

        //TODO: get real values

        const event = await EventsManager.getEventById(eventId);
        const eventLeaderboard = await EventsManager.getLeaderboardForEvent(eventId);

        const volume = event?.volume || 0;
        // const totalPoints = eventLeaderboard.reduce((acc, entry) => acc + entry.points, 0);

        const leaderboard: { walletAddress: string, points: number, prize?: string }[] = [];
        
        let index = 0;
        for (const entry of eventLeaderboard){
            const prize = event?.prizes?.[index] || undefined;
            leaderboard.push({ 
                walletAddress: Helpers.prettyWallet(entry.walletAddress), 
                points: entry.points, 
                prize 
            });
            index++;
        }

		const response = {
			volume,
            leaderboard,
		};
	
		res.status(200).send(response);
    }
);

export { router as eventsRouter };
