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
            name   : "light-geyser-soon-mainnet",
            script : "build/index.js",
            node_args: "--max-old-space-size=8192",
            min_uptime: "5s",
            env: {
                IS_GEYSER_PROCESS: "true",
                CHAIN: 'soon',
                SERVER_NAME: "light-geyser-soon-mainnet",
                PORT: 3346,
            },
        },
        {
            name   : "light-geyser-svmbnb-mainnet",
            script : "build/index.js",
            node_args: "--max-old-space-size=8192",
            min_uptime: "5s",
            env: {
                IS_GEYSER_PROCESS: "true",
                CHAIN: 'svmbnb',
                SERVER_NAME: "light-geyser-svmbnb-mainnet",
                PORT: 3348,
            },
        },
        {
            name   : "light-geyser-soonbase-mainnet",
            script : "build/index.js",
            node_args: "--max-old-space-size=8192",
            min_uptime: "5s",
            env: {
                IS_GEYSER_PROCESS: "true",
                CHAIN: 'soonba',
                SERVER_NAME: "light-geyser-soonbase-mainnet",
                PORT: 3351,
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
