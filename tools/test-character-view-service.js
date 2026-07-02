const { buildCharacterProfileView } = require("../modules/armory/services/characterViewService");

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
  }[id] || "Unknown";
}

const view = buildCharacterProfileView(
  { name: "Andy", race: 1, class: 2, zone: 0, map: 571 },
  { className }
);

console.log(JSON.stringify(view, null, 2));
