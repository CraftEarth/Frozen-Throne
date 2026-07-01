const fs = require("fs");
const normalizeCharacter = require("./normalize-character");
const ItemDisplayResolver = require("./item-display-resolver");

const input = JSON.parse(fs.readFileSync("public/renders/input/character-24.json", "utf8"));
const character = normalizeCharacter(input);
const resolver = new ItemDisplayResolver();

for (const [slot, item] of Object.entries(character.equipment)) {
  const asset = resolver.resolve(item.displayid);
  console.log(slot, item.name);
  console.log(asset);
  console.log("---");
}
