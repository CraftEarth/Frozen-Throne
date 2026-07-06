const TITLE_NAMES = {
  1: "Private",
  2: "Corporal",
  3: "Sergeant",
  4: "Master Sergeant",
  5: "Sergeant Major",
  6: "Knight",
  7: "Knight-Lieutenant",
  8: "Knight-Captain",
  9: "Knight-Champion",
  10: "Lieutenant Commander",
  11: "Commander",
  12: "Marshal",
  13: "Field Marshal",
  14: "Grand Marshal",

  15: "Scout",
  16: "Grunt",
  17: "Sergeant",
  18: "Senior Sergeant",
  19: "First Sergeant",
  20: "Stone Guard",
  21: "Blood Guard",
  22: "Legionnaire",
  23: "Centurion",
  24: "Champion",
  25: "Lieutenant General",
  26: "General",
  27: "Warlord",
  28: "High Warlord"
};

function getTitleName(id) {
  const key = Number(id);
  return TITLE_NAMES[key] || `Title #${key || "?"}`;
}

module.exports = {
  TITLE_NAMES,
  getTitleName
};
