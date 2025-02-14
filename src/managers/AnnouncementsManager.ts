export interface Announcement {
    image: string;
    url: string; 
}

export class AnnouncementsManager {

    static async getAnnouncements(): Promise<Announcement[]> {
        const maintenanceMode = false;

        const announcements: Announcement[] = [
            // {
            //     image: 'https://light.dangervalley.com/news/join_community.png',
            //     url: 'https://t.me/LightAppLounge',
            // },
        ];

        if (maintenanceMode){
            announcements.push({
                image: 'https://light.dangervalley.com/news/maintenance.png',
                url: 'https://light.app/',
            });
        }

        //TODO: add announcement "Follow us on X" 
        //TODO: add announcement "Rate the app on AppStore / Google Play"
        //TODO: add announcement "New app version is available. Update in AppStore / Google Play"

        return announcements
    }

}