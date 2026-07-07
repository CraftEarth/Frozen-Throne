function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function qualityName(q) {
  return {
    0: "Poor",
    1: "Common",
    2: "Uncommon",
    3: "Rare",
    4: "Epic",
    5: "Legendary",
    6: "Artifact",
    7: "Heirloom"
  }[Number(q)] || "Unknown";
}

function qualityClass(q) {
  return "q" + Number(q || 0);
}

module.exports = { esc, qualityName, qualityClass };
