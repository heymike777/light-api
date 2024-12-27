import { Engine } from "../services/solana/types";

export class TraderManager {

    static kDefaultEngineId = 'bonkbot';
    static engines: Engine[] = [
        // {
        //     id: 'light',
        //     title: 'Light',
        //     logo: 'https://light.dangervalley.com/static/light.png',
        //     // isSubscriptionRequired: false,
        //     // isExternal: false,
        // },
        {
            id: 'bonkbot',
            title: 'BonkBot',
            logo: 'https://light.dangervalley.com/static/bonkbot.png',
            // isSubscriptionRequired: true,
            // isExternal: true,
            url: 'https://t.me/bonkbot_bot?start=ref_ceqh3',
            tokenUrl: 'https://t.me/bonkbot_bot?start=ref_ceqh3_ca_{token}',
        },
        {
            id: 'maestro_base',
            title: 'Maestro',
            logo: 'https://light.dangervalley.com/static/maestro.png',
            // isSubscriptionRequired: true,
            // isExternal: true,
            url: 'https://t.me/maestro?start=r-heymike777',
            tokenUrl: 'https://t.me/maestro?start={token}-heymike777',
        },
        {
            id: 'maestro_pro',
            title: 'Maestro',
            logo: 'https://light.dangervalley.com/static/maestro.png',
            // isSubscriptionRequired: true,
            // isExternal: true,
            url: 'https://t.me/maestropro?start=r-heymike777',
            tokenUrl: 'https://t.me/maestropro?start={token}-heymike777',
        },
        // {
        //     id: 'trojan',
        //     title: 'Trojan',
        //     logo: 'https://light.dangervalley.com/static/trojan.png',
        //     isSubscriptionRequired: true,
        //     isExternal: true,
        //     url: '',
        //     tokenUrl: '',
        // },
        // {
        //     id: 'bananagun',
        //     title: 'BananaGun',
        //     logo: 'https://light.dangervalley.com/static/bananagun.png',
        //     isSubscriptionRequired: true,
        //     isExternal: true,
        //     url: '',
        //     tokenUrl: '',
        // },
    ];



}