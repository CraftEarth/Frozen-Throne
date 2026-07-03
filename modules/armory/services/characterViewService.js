const { buildImages } = require("../engine/images");
const { buildCharacterView } = require("../engine/manager");
const { buildStats } = require("../engine/stats");
const { buildEquipment, buildInventory } = require("../engine/items");
const { buildTalentSummary } = require("../engine/talents");

function buildCharacterProfileView(character, options = {}) {
  const helpers = options.helpers || {};
  const equipped = options.equipped || [];
  const inventory = options.inventory || [];
  const learnedTalents = options.talents || [];

  const engineView = buildCharacterView(character, helpers);

  const mergeTemplate = (item) => ({
    ...item,
    ...(item.template || {})
  });

  return {
    character,
    engine: engineView,
    background: engineView.background,
    camera: engineView.camera,
    race: engineView.race,
    stats: buildStats(character),
    equipment: buildEquipment(equipped.map(mergeTemplate)),
    inventory: buildInventory(inventory.map(mergeTemplate)),
    talents: buildTalentSummary(character, learnedTalents),
    images: buildImages({
    character,
    race: engineView.race,
    stats: buildStats(character)
}),
 };
}

module.exports = {
  buildCharacterProfileView
};
