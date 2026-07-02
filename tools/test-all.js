const { getArmoryBackground } = require("../modules/armory/engine/backgrounds");
const { getCamera } = require("../modules/armory/engine/camera");
const { getRaceInfo } = require("../modules/armory/engine/races");
const { buildStats } = require("../modules/armory/engine/stats");
const { buildItem } = require("../modules/armory/engine/items");
const { buildTalentSummary } = require("../modules/armory/engine/talents");
const { buildCharacterProfileView } = require("../modules/armory/services/characterViewService");

function assert(name, condition) {
  if (!condition) {
    console.error("FAILED:", name);
    process.exit(1);
  }
  console.log("PASS:", name);
}

function className(id) {
  return {
    1: "Warrior",
    2: "Paladin",
    3: "Hunter",
    4: "Rogue",
    5: "Priest",
    6: "Death Knight",
    7: "Shaman",
    8: "Mage",
    9: "Warlock",
    11: "Druid"
  }[Number(id)] || "Unknown";
}

const character = {
  guid: 7,
  name: "Andy",
  race: 1,
  class: 2,
  gender: 0,
  level: 21,
  health: 1000,
  power1: 500,
  totalKills: 3,
  map: 571,
  zone: 0
};

assert("background engine", !!getArmoryBackground(character, { className }).url);
assert("camera engine", typeof getCamera(character).distance === "number");
assert("race engine", getRaceInfo(1).name === "Human");
assert("stats engine", buildStats(character).level === 21);
assert("item engine", buildItem({ entry: 123, name: "Test", Quality: 4 }).qualityName === "Epic");
assert("talent engine", buildTalentSummary(character, []).trees.length === 3);

const view = buildCharacterProfileView(character, {
  helpers: { className },
  equipped: [],
  inventory: [],
  talents: []
});

assert("character view service", view.stats.level === 21 && view.background.url);

console.log("ALL ARMORY ENGINE TESTS PASSED");
