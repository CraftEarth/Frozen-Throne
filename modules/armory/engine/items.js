const QUALITY = {
  0: { name: "Poor", color: "#9d9d9d", className: "q0" },
  1: { name: "Common", color: "#ffffff", className: "q1" },
  2: { name: "Uncommon", color: "#1eff00", className: "q2" },
  3: { name: "Rare", color: "#0070dd", className: "q3" },
  4: { name: "Epic", color: "#a335ee", className: "q4" },
  5: { name: "Legendary", color: "#ff8000", className: "q5" },
  6: { name: "Artifact", color: "#e6cc80", className: "q6" },
  7: { name: "Heirloom", color: "#e6cc80", className: "q7" }
};

const INVENTORY_TYPES = {
  1: "Head",
  2: "Neck",
  3: "Shoulder",
  4: "Shirt",
  5: "Chest",
  6: "Waist",
  7: "Legs",
  8: "Feet",
  9: "Wrist",
  10: "Hands",
  11: "Finger",
  12: "Trinket",
  13: "One-Hand",
  14: "Shield",
  15: "Ranged",
  16: "Back",
  17: "Two-Hand",
  18: "Bag",
  19: "Tabard",
  20: "Robe",
  21: "Main Hand",
  22: "Off Hand",
  23: "Held In Off-hand",
  26: "Ranged"
};

function getQuality(quality = 0) {
  return QUALITY[Number(quality)] || QUALITY[1];
}

function getInventoryType(type = 0) {
  return INVENTORY_TYPES[Number(type)] || "Unknown";
}

function buildItem(item = {}) {
  const quality = getQuality(item.Quality ?? item.quality ?? 0);

  return {
    guid: item.guid || item.itemGuid || 0,
    entry: item.entry || item.itemEntry || 0,
    name: item.name || "Unknown Item",
    qualityId: Number(item.Quality ?? item.quality ?? 0),
    qualityName: quality.name,
    qualityColor: quality.color,
    qualityClass: quality.className,
    itemLevel: Number(item.ItemLevel || item.itemLevel || 0),
    requiredLevel: Number(item.RequiredLevel || item.requiredLevel || 0),
    inventoryType: Number(item.InventoryType || item.inventoryType || 0),
    inventoryName: getInventoryType(item.InventoryType || item.inventoryType || 0),
    displayId: Number(item.displayid || item.displayId || 0),
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
  getQuality,
  getInventoryType,
  buildItem,
  buildEquipment,
  buildInventory
};
