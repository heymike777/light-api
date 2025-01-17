export interface Announcement {
    image: string;
    url: string; 
}

export class AnnouncementsManager {

    static async getAnnouncements(): Promise<Announcement[]> {
        const announcements: Announcement[] = [
            {
                image: 'https://light.dangervalley.com/news/join_community.png',
                url: 'https://t.me/LightAppLounge',
            },
        ];

        return announcements
    }

}