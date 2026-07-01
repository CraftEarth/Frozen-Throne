const fs = require("fs");

const slotMap = {
  HEAD: 1,
  SHOULDERS: 3,
  SHIRT: 4,
  CHEST: 5,
  WAIST: 6,
  LEGS: 7,
  FEET: 8,
  WRISTS: 9,
  HANDS: 10,
  BACK: 15,
  MAINHAND: 16,
  OFFHAND: 17,
  RANGED: 18,
  TABARD: 19
};

const manifestFile = process.argv[2] || "public/renders/manifests/character-24.json";
const outFile = process.argv[3] || "public/renders/manifests/character-24-wowviewer.json";

const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));

const customDisplayOverrides = {
  // GhostMaker's GodStick: old display 20423 is not available in Wowhead modelviewer.
  // Use Archus, Greatstaff of Antonidas display for website 3D viewer.
  900001: 64334
};

const equipments = [];

const hasMainHand = !!manifest.equipment?.MAINHAND;
const hasOffHand = !!manifest.equipment?.OFFHAND;

for (const [slotName, item] of Object.entries(manifest.equipment || {})) {
  // For melee classes, ranged/relic slots can steal weapon display slots in the viewer.
  // If real hand weapons exist, skip ranged for the 3D model.
  if (slotName === "RANGED" && (hasMainHand || hasOffHand)) continue;

  const slot = slotMap[slotName];
  if (slot === undefined) continue;
  if (!item.displayid || !item.itemEntry) continue;

  equipments.push({
    item: {
      entry: Number(item.itemEntry),
      displayid: Number(customDisplayOverrides[item.itemEntry] || item.displayid)
    },
    transmog: {},
    slot
  });
}

const wowViewerCharacter = {
  race: Number(manifest.raceId),
  gender: manifest.gender === "Male" ? 0 : 1,
  skin: Number(manifest.appearance.skin),
  face: Number(manifest.appearance.face),
  hairStyle: Number(manifest.appearance.hairStyle),
  hairColor: Number(manifest.appearance.hairColor),
  facialStyle: Number(manifest.appearance.facialStyle),
  equipments
};

fs.writeFileSync(outFile, JSON.stringify(wowViewerCharacter, null, 2));

console.log(`Wrote ${outFile}`);
console.log(JSON.stringify(wowViewerCharacter, null, 2));
