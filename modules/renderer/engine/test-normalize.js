const fs = require("fs");
const normalizeCharacter = require("./normalize-character");

const inputFile = process.argv[2];
if (!inputFile) {
  console.error("Usage: node modules/renderer/engine/test-normalize.js <input-json>");
  process.exit(1);
}

const input = JSON.parse(fs.readFileSync(inputFile, "utf8"));
console.log(JSON.stringify(normalizeCharacter(input), null, 2));
