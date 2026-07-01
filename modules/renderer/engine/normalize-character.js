const slots = require("./slots");
const races = require("./races");
const classes = require("./classes");

function normalizeCharacter(input) {
  const ch = input.character;

  const equipment = {};
  for (const item of input.equipment || []) {
    const slotName = Object.keys(slots).find(k => slots[k] === Number(item.slot));
    if (!slotName) continue;
    equipment[slotName] = item;
  }

  return {
    guid: ch.guid,
    name: ch.name,
    realm: input.realm,
    raceId: ch.race,
    race: races[ch.race] || `Race${ch.race}`,
    classId: ch.class,
    className: classes[ch.class] || `Class${ch.class}`,
    gender: Number(ch.gender) === 1 ? "Female" : "Male",
    level: ch.level,
    appearance: {
      skin: ch.skin,
      face: ch.face,
      hairStyle: ch.hairStyle,
      hairColor: ch.hairColor,
      facialStyle: ch.facialStyle
    },
    equipment,
    output: input.output
  };
}

module.exports = normalizeCharacter;
