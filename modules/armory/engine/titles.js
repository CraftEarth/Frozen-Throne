function buildTitle(title = {}) {
  return {
    id: title.id || title.title || 0,
    name: title.name || "",
    active: Boolean(title.active)
  };
}

function buildTitles(titles = []) {
  return titles.map(buildTitle);
}

module.exports = {
  buildTitle,
  buildTitles
};
