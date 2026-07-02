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
  const safeLimit = Math.max(1, Math.min(Number(limit) || 120, 300));

  const [rows] = await charConn.execute(
    `SELECT ci.bag, ci.slot, ci.item AS itemGuid, ii.itemEntry, ii.count,
            ii.durability, ii.randomPropertyId, ii.enchantments
     FROM character_inventory ci
     JOIN item_instance ii ON ii.guid = ci.item
     WHERE ci.guid = ? AND NOT (ci.bag = 0 AND ci.slot BETWEEN 0 AND 18)
     ORDER BY ci.bag ASC, ci.slot ASC
     LIMIT ${safeLimit}`,
    [guid]
  );

  return rows;
}

async function getItemTemplates(worldConn, entries = []) {
  const cleanEntries = [...new Set(entries.map(Number).filter(Boolean))];

  if (!cleanEntries.length) return new Map();

  const placeholders = cleanEntries.map(() => "?").join(",");

  const [rows] = await worldConn.execute(
    `SELECT entry, name, Quality, ItemLevel, RequiredLevel, InventoryType,
            class, subclass, displayid,
            stat_type1, stat_value1,
            stat_type2, stat_value2,
            stat_type3, stat_value3,
            stat_type4, stat_value4,
            stat_type5, stat_value5,
            stat_type6, stat_value6,
            stat_type7, stat_value7,
            stat_type8, stat_value8,
            stat_type9, stat_value9,
            stat_type10, stat_value10,
            armor, delay, dmg_min1, dmg_max1
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
