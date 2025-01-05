export interface Announcement {
    image: string;
    url: string; // set url through bitly, so I can track clicks
}

export class AnnouncementsManager {

    static async getAnnouncements(): Promise<Announcement[]> {
        const announcements: Announcement[] = [
            // {
            //     image: 'https://light.dangervalley.com/news/light_on_tg.png',
            //     url: 'https://light.app',
            // },
            // {
            //     image: 'https://pbs.twimg.com/profile_banners/1644933348274446336/1728626232/1500x500',
            //     url: 'https://light.app',
            // },
            // {
            //     image: 'https://pbs.twimg.com/profile_banners/199225029/1666359577/1500x500',
            //     url: 'https://light.app',
            // }
        ];

        return announcements
    }

}