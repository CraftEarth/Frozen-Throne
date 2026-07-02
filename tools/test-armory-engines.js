const { getArmoryBackground } = require("../modules/armory/engine/backgrounds");

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

console.log("Paladin fallback:", getArmoryBackground({ class: 2, zone: 0, map: 999 }, { className }));
console.log("Icecrown zone:", getArmoryBackground({ class: 6, zone: 210, map: 571 }, { className }));
console.log("Northrend map:", getArmoryBackground({ class: 8, zone: 0, map: 571 }, { className }));
