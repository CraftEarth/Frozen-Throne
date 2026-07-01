const fs = require("fs");
const path = require("path");
const config = require("../config");

class AssetResolver {

    constructor() {
        this.dataPath = config.wowDataPath;
    }

    verifyClient() {

        const files = [
            "common.MPQ",
            "common-2.MPQ",
            "expansion.MPQ",
            "lichking.MPQ",
            "patch.MPQ"
        ];

        const missing = [];

        for (const file of files) {
            const full = path.join(this.dataPath, file);

            if (!fs.existsSync(full))
                missing.push(full);
        }

        return {
            ok: missing.length === 0,
            missing
        };
    }

    resolveItem(displayId) {

        return {
            displayId,
            status: "pending",
            model: null,
            textures: []
        };

    }

}

module.exports = AssetResolver;
