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

const ITEM_STATS = {
  3: "Agility",
  4: "Strength",
  5: "Intellect",
  6: "Spirit",
  7: "Stamina",
  12: "Defense Rating",
  13: "Dodge Rating",
  14: "Parry Rating",
  15: "Block Rating",
  16: "Hit Melee Rating",
  17: "Hit Ranged Rating",
  18: "Hit Spell Rating",
  19: "Crit Melee Rating",
  20: "Crit Ranged Rating",
  21: "Crit Spell Rating",
  28: "Haste Melee Rating",
  29: "Haste Ranged Rating",
  30: "Haste Spell Rating",
  31: "Hit Rating",
  32: "Crit Rating",
  35: "Resilience Rating",
  36: "Haste Rating",
  37: "Expertise Rating",
  38: "Attack Power",
  39: "Ranged Attack Power",
  41: "Healing Power",
  42: "Spell Damage",
  43: "Mana Regen",
  44: "Armor Penetration",
  45: "Spell Power",
  46: "Health Regen",
  47: "Spell Penetration",
  48: "Block Value"
};



function parseInsertedGemEnchantments(item = {}) {
  const raw = String(item.enchantments || "").trim();
  if (!raw) return [];

  const nums = raw.split(/\s+/).map(n => Number(n || 0));

  // Trinity enchantment array commonly stores gem enchant IDs around these positions.
  // We keep all useful known gem/enchant IDs for display.
  return nums.filter(n => n > 0);
}

function buildSockets(item = {}) {
  const sockets = [];

  for (let i = 1; i <= 3; i++) {
    const color = Number(item[`socketColor_${i}`] || 0);
    const content = Number(item[`socketContent_${i}`] || 0);

    if (color || content) {
      sockets.push({
        slot: i,
        color,
        content,
        colorName:
          color === 1 ? "Meta" :
          color === 2 ? "Red" :
          color === 4 ? "Yellow" :
          color === 8 ? "Blue" :
          color === 14 ? "Prismatic" :
          "Socket"
      });
    }
  }

  return sockets;
}

function buildItemStats(item = {}) {
  const stats = [];

  for (let i = 1; i <= 10; i++) {
    const type = Number(item[`stat_type${i}`] || 0);
    const value = Number(item[`stat_value${i}`] || 0);

    if (type && value) {
      stats.push({
        type,
        name: ITEM_STATS[type] || `Stat ${type}`,
        value
      });
    }
  }

  return stats;
}

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
    durability: item.durability ?? null,
    armor: Number(item.armor || 0),
    damage: {
      min: Number(item.dmg_min1 || 0),
      max: Number(item.dmg_max1 || 0),
      speed: Number(item.delay || 0)
    },
    stats: buildItemStats(item),
    insertedEnchantIds: parseInsertedGemEnchantments(item),
    sockets: buildSockets(item),
    socketBonus: Number(item.socketBonus || 0),
    iconDisplayId: Number(item.displayid || item.displayId || 0)
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
  parseInsertedGemEnchantments,
  buildSockets,
  buildItemStats,
  parseInsertedGemEnchantments,
  buildSockets,
  buildItemStats,
  buildItem,
  buildEquipment,
  buildInventory
};
