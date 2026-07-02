const { buildItem, getQuality, getInventoryType } = require("../modules/armory/engine/items");

console.log("Quality Epic:", getQuality(4));
console.log("Inventory Two-Hand:", getInventoryType(17));

const item = buildItem({
  entry: 50731,
  name: "Archus, Greatstaff of Antonidas",
  Quality: 4,
  ItemLevel: 284,
  RequiredLevel: 80,
  InventoryType: 17,
  displayid: 64334,
  count: 1
});

console.log(JSON.stringify(item, null, 2));
