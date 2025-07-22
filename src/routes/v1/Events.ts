import express, { Request, Response } from "express";

const router = express.Router();

router.get(
    '/api/v1/events/:eventId',
    async (req: Request, res: Response) => {
		const eventId = '' + req.params.eventId;

        //TODO: get real values

        const volume = 2234567;
        const leaderboard = [
            {
                walletAddress: '1234...4321',
                volume: 1234567,
                prize: '$1000 + NFT',
            },
            {
                walletAddress: '2222...2222',
                volume: 123456,
                prize: '$500',
            },
            {
                walletAddress: '3333...3333',
                volume: 12345,
                prize: '$250',
            },
            {
                walletAddress: '4444...4444',
                volume: 1234,
                prize: '$100',
            },
            {
                walletAddress: '5555...5555',
                volume: 123,
                prize: '$90',
            },
            {
                walletAddress: '6666...6666',
                volume: 12,
                prize: '$80',
            },
            {
                walletAddress: '7777...6666',
                volume: 11,
                prize: '$80',
            },
            {
                walletAddress: '8888...6666',
                volume: 5,
                prize: '$80',
            },
            {
                walletAddress: '9999...6666',
                volume: 5,
                prize: '$80',
            },
            {
                walletAddress: '0000...6666',
                volume: 2,
                prize: '$80',
            },
        ];

		const response = {
			volume,
            leaderboard,
		};
	
		res.status(200).send(response);
    }
);

export { router as eventsRouter };
