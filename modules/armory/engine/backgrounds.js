function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getArmoryBackground(ch, helpers = {}) {
  const className = helpers.className || ((id) => String(id || "unknown"));

  const classKey = slug(className(ch.class));

  return {
    classKey,
    url: `/images/armory/backgrounds/classes/${classKey}.jpg`
  };
}

module.exports = {
  getArmoryBackground
};
