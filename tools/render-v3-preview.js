require("dotenv").config();

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const { loadCharacterView } = require("../modules/armory/repositories/characterViewRepository");
const { buildCharacterProfileView } = require("../modules/armory/services/characterViewService");
const { renderCharacterV3 } = require("../modules/armory/renderers/characterV3Renderer");

function className(id) {
  return {
    1: "Warrior", 2: "Paladin", 3: "Hunter", 4: "Rogue", 5: "Priest",
    6: "Death Knight", 7: "Shaman", 8: "Mage", 9: "Warlock", 11: "Druid"
  }[Number(id)] || "Unknown";
}

async function main() {
  const guid = Number(process.argv[2] || 7);

  const dbBase = {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "trinity",
    password: process.env.DB_PASSWORD || process.env.DB_PASS || ""
  };

  const charConn = await mysql.createConnection({ ...dbBase, database: process.env.DB_CHARACTERS || "characters" });
  const worldConn = await mysql.createConnection({ ...dbBase, database: process.env.DB_WORLD || "world" });

  const raw = await loadCharacterView(charConn, worldConn, guid);
  if (!raw) throw new Error("Character not found: " + guid);

  const view = buildCharacterProfileView(raw.character, {
    helpers: { className },
    equipped: raw.equipped,
    inventory: raw.inventory,
    talents: []
  });

  const body = renderCharacterV3(view);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Armory V3 Preview</title><link rel="stylesheet" href="/css/style.css"></head><body>${body}  <script type="module" src="/js/armory-live-model.js"></script>
</body></html>`;

  fs.mkdirSync(path.join(__dirname, "../public/dev"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "../public/dev/armory-v3.html"), html);

  await charConn.end();
  await worldConn.end();

  console.log("Wrote /public/dev/armory-v3.html");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
