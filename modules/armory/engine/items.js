function buildItem(item = {}) {
  return {
    guid: item.guid || item.itemGuid || 0,
    entry: item.entry || item.itemEntry || 0,
    name: item.name || "Unknown Item",
    quality: Number(item.quality || 0),
    icon: item.icon || "",
    slot: item.slot ?? null,
    count: Number(item.count || 1),
    durability: item.durability ?? null
  };
}

function buildEquipment(items = []) {
  return items.map(buildItem);
}

function buildInventory(items = []) {
  return items.map(buildItem);
}

module.exports = {
  buildItem,
  buildEquipment,
  buildInventory
};
