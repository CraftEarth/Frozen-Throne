const characterRepo = require("./characterRepository");
const itemRepo = require("./itemRepository");

async function loadCharacterView(charConn, worldConn, guid) {
  const character = await characterRepo.getCharacterByGuid(charConn, guid);
  if (!character) return null;

  const guild = await characterRepo.getCharacterGuild(charConn, guid);

  const equipped = await itemRepo.getEquippedItems(charConn, guid);
  const inventory = await itemRepo.getBagItems(charConn, guid);

  const entries = [
    ...equipped.map(i => i.itemEntry),
    ...inventory.map(i => i.itemEntry)
  ];

  const templates = await itemRepo.getItemTemplates(worldConn, entries);

  // Merge template data into equipped items
  for (const item of equipped) {
    item.template = templates.get(Number(item.itemEntry)) || null;
  }

  // Merge template data into bag items
  for (const item of inventory) {
    item.template = templates.get(Number(item.itemEntry)) || null;
  }

  return {
    character,
    guild,
    equipped,
    inventory
  };
}

module.exports = {
  loadCharacterView
};
