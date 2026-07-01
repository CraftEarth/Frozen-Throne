const fs = require("fs");
const normalizeCharacter = require("./engine/normalize-character");
const ItemDisplayResolver = require("./engine/item-display-resolver");

const inputPath = process.argv[2];

if (!inputPath) {
  console.error("Usage: node modules/renderer/render-character.js <input-json>");
  process.exit(1);
}

const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const character = normalizeCharacter(input);
const resolver = new ItemDisplayResolver();

for (const [slot, item] of Object.entries(character.equipment)) {
  item.asset = resolver.resolve(item.displayid);
}

console.log("FrozenThrone Render Engine v1");
console.log("--------------------------------");
console.log(`Character: ${character.name}`);
console.log(`Race/Class: ${character.race} ${character.gender} ${character.className}`);
console.log(`Appearance: skin ${character.appearance.skin}, face ${character.appearance.face}, hair ${character.appearance.hairStyle}, color ${character.appearance.hairColor}, facial ${character.appearance.facialStyle}`);
console.log(`Equipment slots: ${Object.keys(character.equipment).length}`);
console.log("Equipped:");
for (const [slot, item] of Object.entries(character.equipment)) {
  console.log(`- ${slot}: ${item.name} | entry ${item.itemEntry} | display ${item.displayid}`);
}
console.log("--------------------------------");
console.log(`Model output: ${character.output.model}`);
console.log(`Portrait output: ${character.output.portrait}`);
const manifestPath = `/var/www/frozenthrone/public/renders/manifests/character-${character.guid}.json`;
fs.writeFileSync(manifestPath, JSON.stringify(character, null, 2));

console.log(`Manifest written: ${manifestPath}`);
console.log("Renderer backend not connected yet.");
