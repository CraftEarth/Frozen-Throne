async function getEquippedItems(charConn, guid) {
  const [rows] = await charConn.execute(
    `SELECT ci.slot, ci.item AS itemGuid, ii.itemEntry, ii.count, ii.durability,
            ii.randomPropertyId, ii.enchantments
     FROM character_inventory ci
     JOIN item_instance ii ON ii.guid = ci.item
     WHERE ci.guid = ? AND ci.bag = 0 AND ci.slot BETWEEN 0 AND 18
     ORDER BY ci.slot ASC`,
    [guid]
  );

  return rows;
}

async function getBagItems(charConn, guid, limit = 120) {
  const [rows] = await charConn.execute(
    `SELECT ci.bag, ci.slot, ci.item AS itemGuid, ii.itemEntry, ii.count,
            ii.durability, ii.randomPropertyId, ii.enchantments
     FROM character_inventory ci
     JOIN item_instance ii ON ii.guid = ci.item
     WHERE ci.guid = ? AND NOT (ci.bag = 0 AND ci.slot BETWEEN 0 AND 18)
     ORDER BY ci.bag ASC, ci.slot ASC
     LIMIT ?`,
    [guid, limit]
  );

  return rows;
}

async function getItemTemplates(worldConn, entries = []) {
  const cleanEntries = [...new Set(entries.map(Number).filter(Boolean))];

  if (!cleanEntries.length) return new Map();

  const placeholders = cleanEntries.map(() => "?").join(",");

  const [rows] = await worldConn.execute(
    `SELECT entry, name, Quality, ItemLevel, RequiredLevel, InventoryType,
            class, subclass, displayid
     FROM item_template
     WHERE entry IN (${placeholders})`,
    cleanEntries
  );

  return new Map(rows.map(row => [Number(row.entry), row]));
}

module.exports = {
  getEquippedItems,
  getBagItems,
  getItemTemplates
};
