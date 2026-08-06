require("dotenv").config();

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const frostDbConfig = {
  host: process.env.DB_HOST || process.env.MYSQL_HOST || "127.0.0.1",
  user: process.env.DB_USER || process.env.MYSQL_USER || "root",
  password: process.env.DB_PASS || process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || "",
  multipleStatements: false
};

const shadowDbConfig = {
  host: process.env.SHADOW_DB_HOST || frostDbConfig.host,
  user: process.env.SHADOW_DB_USER || frostDbConfig.user,
  password: process.env.SHADOW_DB_PASSWORD || frostDbConfig.password,
  multipleStatements: false
};

async function main() {
  const guid = Number(process.argv[2]);
  const realm = process.argv[3] || "main";

  if (!guid) {
    console.error("Usage: node modules/renderer/build-character-input.js <guid> [main|shadowmourne]");
    process.exit(1);
  }

  if (!["main", "shadowmourne"].includes(realm)) {
    throw new Error(`Unsupported realm: ${realm}`);
  }

  const shadow = realm === "shadowmourne";
  const dbConfig = shadow ? shadowDbConfig : frostDbConfig;
  const charactersDb = shadow ? "acore_characters" : "characters";
  const worldDb = shadow ? "acore_world" : "world";

  const charConn = await mysql.createConnection({ ...dbConfig, database: charactersDb });
  const worldConn = await mysql.createConnection({ ...dbConfig, database: worldDb });

  const [chars] = await charConn.execute(
    `SELECT guid, account, name, race, class, gender, level,
            skin, face, hairStyle, hairColor, facialStyle,
            equipmentCache
     FROM characters
     WHERE guid = ?
     LIMIT 1`,
    [guid]
  );

  if (!chars.length) {
    throw new Error(`Character ${guid} not found in ${charactersDb}`);
  }

  const ch = chars[0];

  const [gear] = await charConn.execute(
    `SELECT ci.slot, ci.item AS itemGuid, ii.itemEntry, ii.enchantments,
            it.name, it.displayid, it.InventoryType, it.Quality, it.ItemLevel
     FROM character_inventory ci
     JOIN item_instance ii ON ii.guid = ci.item
     JOIN ${worldDb}.item_template it ON it.entry = ii.itemEntry
     WHERE ci.guid = ? AND ci.bag = 0 AND ci.slot BETWEEN 0 AND 18
     ORDER BY ci.slot ASC`,
    [guid]
  );

  await charConn.end();
  await worldConn.end();

  const data = {
    renderVersion: 1,
    realm,
    output: {
      model: `/var/www/frozenthrone/public/images/armory/models/character-${realm}-${guid}.png`,
      portrait: `/var/www/frozenthrone/public/images/armory/portraits/character-${realm}-${guid}.png`
    },
    character: ch,
    equipment: gear.map(g => ({
      slot: g.slot,
      itemGuid: g.itemGuid,
      itemEntry: g.itemEntry,
      name: g.name,
      displayid: g.displayid,
      inventoryType: g.InventoryType,
      quality: g.Quality,
      itemLevel: g.ItemLevel,
      enchantments: g.enchantments
    }))
  };

  const outDir = "/var/www/frozenthrone/public/renders/input";
  fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, `character-${realm}-${guid}.json`);
  fs.writeFileSync(outFile, JSON.stringify(data, null, 2));

  console.log(`Render input written: ${outFile}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
