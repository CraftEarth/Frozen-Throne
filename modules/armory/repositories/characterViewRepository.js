const characterRepo = require("./characterRepository");
const itemRepo = require("./itemRepository");

async function loadCharacterView(charConn, worldConn, guid) {

    const character =
        await characterRepo.getCharacterByGuid(charConn, guid);

    if (!character)
        return null;

    const guild =
        await characterRepo.getCharacterGuild(charConn, guid);

    const equipped =
        await itemRepo.getEquippedItems(charConn, guid);

    const inventory =
        await itemRepo.getBagItems(charConn, guid);

    const entries = [
        ...equipped.map(i => i.itemEntry),
        ...inventory.map(i => i.itemEntry)
    ];

    const templates =
        await itemRepo.getItemTemplates(worldConn, entries);

    return {
        character,
        guild,
        equipped,
        inventory,
        templates
    };

}

module.exports = {
    loadCharacterView
};
