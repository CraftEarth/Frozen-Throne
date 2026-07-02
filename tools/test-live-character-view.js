require("dotenv").config();

const mysql = require("mysql2/promise");
const { loadCharacterView } = require("../modules/armory/repositories/characterViewRepository");
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

  const charConn = await mysql.createConnection({
    ...dbBase,
    database: process.env.DB_CHARACTERS || "characters"
  });

  const worldConn = await mysql.createConnection({
    ...dbBase,
    database: process.env.DB_WORLD || "world"
  });

  const raw = await loadCharacterView(charConn, worldConn, guid);

  if (!raw) {
    console.log(JSON.stringify({ error: "Character not found", guid }, null, 2));
    return;
  }

  const view = buildCharacterProfileView(raw.character, {
    helpers: { className },
    equipped: raw.equipped,
    inventory: raw.inventory,
    talents: []
  });

  console.log(JSON.stringify({
    character: {
      guid: view.character.guid,
      name: view.character.name,
      level: view.character.level,
      race: view.race,
      class: className(view.character.class)
    },
    background: view.background,
    camera: view.camera,
    stats: view.stats,
    equipmentCount: view.equipment.length,
    inventoryCount: view.inventory.length,
    talentSummary: view.talents
  }, null, 2));

  await charConn.end();
  await worldConn.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
