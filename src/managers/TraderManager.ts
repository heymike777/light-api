import { Engine } from "../services/solana/types";

export class TraderManager {

    static kDefaultEngineId = 'bonkbot';
    static engines: Engine[] = [
        {
            id: 'light',
            title: 'Light',
            logo: 'https://light.dangervalley.com/static/light.png',
            isSubscriptionRequired: false,
            isExternal: false,
        },
        {
            id: 'bonkbot',
            title: 'BonkBot',
            logo: 'https://light.dangervalley.com/static/bonkbot.png',
            url: 'https://t.me/bonkbot_bot?start=ref_ceqh3',
            tokenUrl: 'https://t.me/bonkbot_bot?start=ref_ceqh3_ca_{token}',
            isSubscriptionRequired: true,
            isExternal: true,
        },
        {
            id: 'maestro_base',
            title: 'Maestro',
            logo: 'https://light.dangervalley.com/static/maestro.png',
            url: 'https://t.me/maestro?start=r-heymike777',
            tokenUrl: 'https://t.me/maestro?start={token}-heymike777',
            isSubscriptionRequired: true,
            isExternal: true,
        },
        {
            id: 'maestro_pro',
            title: 'Maestro Pro',
            logo: 'https://light.dangervalley.com/static/maestro.png',
            url: 'https://t.me/maestropro?start=r-heymike777',
            tokenUrl: 'https://t.me/maestropro?start={token}-heymike777',
            isSubscriptionRequired: true,
            isExternal: true,
        },
        // {
        //     id: 'trojan',
        //     title: 'Trojan',
        //     logo: 'https://light.dangervalley.com/static/trojan.png',
        //     url: '',
        //     tokenUrl: '',
        //     isSubscriptionRequired: true,
        //     isExternal: true,
        // },
        // {
        //     id: 'bananagun',
        //     title: 'BananaGun',
        //     logo: 'https://light.dangervalley.com/static/bananagun.png',
        //     url: '',
        //     tokenUrl: '',
        //     isSubscriptionRequired: true,
        //     isExternal: true,
        // },
    ];



}