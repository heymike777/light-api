module.exports = {
    apps : [
        {
            name   : "light-geyser",
            script : "build/index.js",
            node_args: "--max-old-space-size=8192",
            min_uptime: "5s",
            env: {
                IS_GEYSER_PROCESS: "true",
                SERVER_NAME: "light-geyser",
                PORT: 3340,
            },
        },
        {
            name   : "light-cron",
            script : "build/index.js",
            node_args: "--max-old-space-size=4096",
            min_uptime: "10s",
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
            env: {
                IS_TELEGRAM_PROCESS: "true",
                SERVER_NAME: "light-telegram",
                PORT: 3342,
            },
        },
        {
            name   : "light-main",
            script : "build/index.js",
            node_args: "--max-old-space-size=4096",
            exec_mode: "cluster",
            instances: 1,
            env: {
                IS_MAIN_PROCESS: "true",
                SERVER_NAME: "light-main",
                PORT: 3333,
            },
        },
    ]
}
