module.exports = {
    apps : [
        {
            name   : "light-main",
            script : "build/index.js",
            node_args: "--max-old-space-size=4096",
            min_uptime: "5s",
            exec_mode: "cluster",
            instances: 10,
            env: {
                IS_MAIN_PROCESS: "true",
                SERVER_NAME: "light-main",
                PORT: 3333,
            },
        },
        {
            name   : "light-geyser",
            script : "build/index.js",
            node_args: "--max-old-space-size=8192",
            min_uptime: "5s",
            env: {
                IS_GEYSER_PROCESS: "true",
                CHAIN: 'sol',
                SERVER_NAME: "light-geyser",
                PORT: 3340,
            },
        },
        {
            name   : "light-cron",
            script : "build/index.js",
            node_args: "--max-old-space-size=4096",
            min_uptime: "5s",
            env: {
                IS_CRON_PROCESS: "true",
                SERVER_NAME: "light-cron",
                PORT: 3341,
            },
        },
        {
            name   : "light-telegram",
            script : "build/index.js",
            node_args: "--max-old-space-size=4096",
            min_uptime: "5s",
            env: {
                IS_TELEGRAM_PROCESS: "true",
                SERVER_NAME: "light-telegram",
                PORT: 3342,
            },
        },
        {
            name   : "light-wallets-generator",
            script : "build/index.js",
            node_args: "--max-old-space-size=4096",
            min_uptime: "5s",
            exec_mode: "cluster",
            instances: 5,
            env: {
                IS_WALLET_GENERATOR_PROCESS: "true",
                SERVER_NAME: "light-wallets-generator",
                PORT: 3343,
            },
        },
        {
            name   : "light-geyser-sonic-svm",
            script : "build/index.js",
            node_args: "--max-old-space-size=8192",
            min_uptime: "5s",
            env: {
                IS_GEYSER_PROCESS: "true",
                CHAIN: 'sonic',
                SERVER_NAME: "light-geyser-sonic-svm",
                PORT: 3344,
            },
        },
        {
            name   : "light-geyser-sonic-svm-testnet",
            script : "build/index.js",
            node_args: "--max-old-space-size=8192",
            min_uptime: "5s",
            env: {
                IS_GEYSER_PROCESS: "true",
                CHAIN: 'sonic_testnet',
                SERVER_NAME: "light-geyser-sonic-svm-testnet",
                PORT: 3345,
            },
        },
        {
            name   : "light-prices",
            script : "build/index.js",
            node_args: "--max-old-space-size=8192",
            min_uptime: "5s",
            env: {
                IS_PRICES_PROCESS: "true",
                SERVER_NAME: "light-prices",
                PORT: 3350,
            },
        },
    ]
}
