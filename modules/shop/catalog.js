const SHOP_ITEMS = Object.freeze([
  {
    sku: "invincibles-reins",
    entry: 50818,
    name: "Invincible's Reins",
    icon: "🐉",
    category: "Mounts",
    description: "The legendary mount of the Lich King.",
    quantity: 1,
    tokenCost: 250
  },
  {
    sku: "swift-spectral-tiger",
    entry: 33225,
    name: "Reins of the Swift Spectral Tiger",
    icon: "🐅",
    category: "Mounts",
    description: "A rare spectral mount for dedicated players.",
    quantity: 1,
    tokenCost: 150
  },
  {
    sku: "lil-phylactery",
    entry: 49693,
    name: "Lil' Phylactery",
    icon: "🐾",
    category: "Companion Pets",
    description: "Summons the sinister Lil' K.T. companion pet.",
    quantity: 1,
    tokenCost: 40
  },
  {
    sku: "portable-hole",
    entry: 51809,
    name: "Portable Hole",
    icon: "🎒",
    category: "Bags & Utility",
    description: "A 24-slot bag delivered directly to your mailbox.",
    quantity: 1,
    tokenCost: 10
  },
  {
    sku: "fish-feast-stack",
    entry: 43015,
    name: "Fish Feast",
    icon: "🍲",
    category: "Food & Drink",
    description: "A stack of raid feasts that restores health and mana and grants a Well Fed combat bonus.",
    quantity: 20,
    tokenCost: 2
  },
  {
    sku: "honeymint-tea-stack",
    entry: 33445,
    name: "Honeymint Tea",
    icon: "🍵",
    category: "Food & Drink",
    description: "A full stack of Northrend tea that restores mana while resting between battles.",
    quantity: 20,
    tokenCost: 1
  },
  {
    sku: "runic-healing-potions",
    entry: 33447,
    name: "Runic Healing Potion",
    icon: "❤️",
    category: "Potions",
    description: "Five emergency healing potions for dungeons, raids, and dangerous encounters.",
    quantity: 5,
    tokenCost: 1
  },
  {
    sku: "runic-mana-potions",
    entry: 33448,
    name: "Runic Mana Potion",
    icon: "💧",
    category: "Potions",
    description: "Five mana-restoring potions for healers and spellcasters.",
    quantity: 5,
    tokenCost: 1
  },
  {
    sku: "speed-potions",
    entry: 40211,
    name: "Potion of Speed",
    icon: "⚡",
    category: "Raid Consumables",
    description: "Five combat potions that greatly increase haste for a short duration.",
    quantity: 5,
    tokenCost: 2
  },
  {
    sku: "wild-magic-potions",
    entry: 40212,
    name: "Potion of Wild Magic",
    icon: "✨",
    category: "Raid Consumables",
    description: "Five combat potions that temporarily increase spell power and critical strike rating.",
    quantity: 5,
    tokenCost: 2
  },
  {
    sku: "frost-wyrm-flasks",
    entry: 46376,
    name: "Flask of the Frost Wyrm",
    icon: "❄️",
    category: "Flasks",
    description: "Three spell-power flasks that persist through death for raid-ready casters and healers.",
    quantity: 3,
    tokenCost: 3
  },
  {
    sku: "endless-rage-flasks",
    entry: 46377,
    name: "Flask of Endless Rage",
    icon: "🗡️",
    category: "Flasks",
    description: "Three attack-power flasks that persist through death for physical damage dealers.",
    quantity: 3,
    tokenCost: 3
  },
  {
    sku: "pure-mojo-flasks",
    entry: 46378,
    name: "Flask of Pure Mojo",
    icon: "🔷",
    category: "Flasks",
    description: "Three mana-regeneration flasks that persist through death for long encounters.",
    quantity: 3,
    tokenCost: 3
  },
  {
    sku: "stoneblood-flasks",
    entry: 46379,
    name: "Flask of Stoneblood",
    icon: "🛡️",
    category: "Flasks",
    description: "Three maximum-health flasks that persist through death for tanks and frontline fighters.",
    quantity: 3,
    tokenCost: 3
  }
]);

const SHOP_CATEGORIES = Object.freeze([
  "Food & Drink",
  "Potions",
  "Raid Consumables",
  "Flasks",
  "Bags & Utility",
  "Companion Pets",
  "Mounts"
]);

function getShopItem(sku) {
  return SHOP_ITEMS.find(item => item.sku === String(sku || "")) || null;
}

module.exports = {
  SHOP_ITEMS,
  SHOP_CATEGORIES,
  getShopItem
};
