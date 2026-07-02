const { getArmoryBackground } = require("./backgrounds");
const { getCamera } = require("./camera");
const { getRaceInfo } = require("./races");

function buildCharacterView(character, helpers = {}) {

    return {
        background: getArmoryBackground(character, helpers),
        camera: getCamera(character),
        race: getRaceInfo(character.race)
    };

}

module.exports = {
    buildCharacterView
};
