function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const ZONE_BACKGROUNDS = {
  210: "icecrown",
  4395: "dalaran",
  1519: "stormwind",
  1637: "orgrimmar"
};

const MAP_BACKGROUNDS = {
  571: "northrend",
  0: "eastern-kingdoms",
  1: "kalimdor"
};

function getArmoryBackground(ch, helpers = {}) {
  const className = helpers.className || ((id) => String(id || "unknown"));

  const zoneId = Number(ch.zone || 0);
  const mapId = Number(ch.map || 0);
  const classKey = slug(className(ch.class));

  if (ZONE_BACKGROUNDS[zoneId]) {
    return {
      type: "zone",
      key: ZONE_BACKGROUNDS[zoneId],
      url: `/images/armory/backgrounds/zones/${ZONE_BACKGROUNDS[zoneId]}.jpg`
    };
  }

  if (MAP_BACKGROUNDS[mapId]) {
    return {
      type: "map",
      key: MAP_BACKGROUNDS[mapId],
      url: `/images/armory/backgrounds/zones/${MAP_BACKGROUNDS[mapId]}.jpg`
    };
  }

  return {
    type: "class",
    key: classKey,
    url: `/images/armory/backgrounds/classes/${classKey}.jpg`
  };
}

module.exports = {
  getArmoryBackground
};
