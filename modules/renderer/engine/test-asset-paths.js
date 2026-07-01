const fs = require("fs");
const AssetPathResolver = require("./asset-path-resolver");

const manifest = JSON.parse(fs.readFileSync("public/renders/manifests/character-24.json", "utf8"));
const resolver = new AssetPathResolver();

const head = manifest.equipment.HEAD;
console.log("Character:", manifest.race, manifest.gender, manifest.className);
console.log("Head item:", head.name);
console.log("DBC asset:", head.asset);
console.log("Resolved file:", resolver.resolveHeadModel(head.asset.model, manifest.race, manifest.gender));
