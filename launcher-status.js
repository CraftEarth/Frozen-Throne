const express = require("express");
const fs = require("fs");
const path = require("path");
const net = require("net");

const router = express.Router();

const VERSION_FILE = path.join(
    __dirname,
    "public",
    "launcher",
    "manifest.json"
);

function checkPort(port, host = "127.0.0.1", timeout = 1500) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let finished = false;

        const finish = (online) => {
            if (finished) {
                return;
            }

            finished = true;
            socket.destroy();
            resolve(online);
        };

        socket.setTimeout(timeout);

        socket.once("connect", () => finish(true));
        socket.once("timeout", () => finish(false));
        socket.once("error", () => finish(false));

        socket.connect(port, host);
    });
}

router.get("/status", async (req, res) => {
    try {
        let versionInfo = {
            launcherVersion: "0.1.1",
            clientVersion: "1.0.0",
            maintenance: false,
            message: "Welcome to FrozenThrone!"
        };

        if (fs.existsSync(VERSION_FILE)) {
            const rawJson = fs.readFileSync(VERSION_FILE, "utf8");

            versionInfo = {
                ...versionInfo,
                ...JSON.parse(rawJson)
            };
        }

        const [
            frostborneAuthOnline,
            frostborneWorldOnline,
            shadowmourneAuthOnline,
            shadowmourneWorldOnline
        ] = await Promise.all([
            checkPort(3724),
            checkPort(8085),
            checkPort(3725),
            checkPort(8087)
        ]);

        const frostborneOnline =
            frostborneAuthOnline &&
            frostborneWorldOnline;

        const shadowmourneOnline =
            shadowmourneAuthOnline &&
            shadowmourneWorldOnline;

        res.json({
            success: true,
            launcherVersion: versionInfo.launcherVersion,
            clientVersion: versionInfo.clientVersion,
            maintenance: Boolean(versionInfo.maintenance),
            message:
                versionInfo.message ||
                "Welcome to FrozenThrone!",

            realms: {
                classic: {
                    name: "FrozenThrone - Frostborne",
                    online: frostborneOnline,
                    status:
                        frostborneOnline
                            ? "Online"
                            : "Offline"
                },

                bots: {
                    name: "FrozenThrone - Shadowmourne",
                    online: shadowmourneOnline,
                    status:
                        shadowmourneOnline
                            ? "Online"
                            : "Offline"
                }
            },

            checkedAt: new Date().toISOString()
        });
    }
    catch (error) {
        console.error(
            "Launcher status error:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Launcher status is temporarily unavailable."
        });
    }
});

module.exports = router;
