const SHOP_ITEMS = Object.freeze([
  {
    sku: "invincibles-reins",
    entry: 50818,
    name: "Invincible's Reins",
    icon: "🐉",
    category: "Mount",
    description: "The legendary mount of the Lich King.",
    tokenCost: 250
  },
  {
    sku: "swift-spectral-tiger",
    entry: 33225,
    name: "Reins of the Swift Spectral Tiger",
    icon: "🐅",
    category: "Mount",
    description: "A rare spectral mount for dedicated players.",
    tokenCost: 150
  },
  {
    sku: "lil-phylactery",
    entry: 49693,
    name: "Lil' Phylactery",
    icon: "🐾",
    category: "Pet",
    description: "Summons the sinister Lil' K.T. companion pet.",
    tokenCost: 40
  },
  {
    sku: "portable-hole",
    entry: 51809,
    name: "Portable Hole",
    icon: "🎒",
    category: "Bag",
    description: "A 24-slot bag delivered directly to your mailbox.",
    tokenCost: 10
  }
]);

function getShopItem(sku) {
  return SHOP_ITEMS.find(item => item.sku === String(sku || "")) || null;
}

module.exports = {
  SHOP_ITEMS,
  getShopItem
};
