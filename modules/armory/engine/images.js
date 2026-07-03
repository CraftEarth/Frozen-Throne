"use strict";

const CLASS_NAMES = {
  1: "warrior",
  2: "paladin",
  3: "hunter",
  4: "rogue",
  5: "priest",
  6: "death-knight",
  7: "shaman",
  8: "mage",
  9: "warlock",
  11: "druid"
};

function slug(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function classTheme(character = {}) {
  return CLASS_NAMES[Number(character.class)] || slug(character.className || "default") || "default";
}

function buildImages(view = {}) {
  const character = view.character || {};
  const theme = classTheme(character);

  const classBg = `/images/armory/backgrounds/classes/${theme}.jpg`;

  return {
    theme,
    header: classBg,
    paperDoll: classBg,
    portrait: classBg,
    accent: theme === "paladin" ? "#f4d35e" : "#73d7ff"
  };
}

module.exports = {
  buildImages
};
