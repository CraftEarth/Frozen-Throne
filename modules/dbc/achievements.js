const { readDbc } = require("./loader");

const ACHIEVEMENT_DBC = process.env.ACHIEVEMENT_DBC || "/opt/trinity/bin/dbc/Achievement.dbc";

let cache = null;

function loadAchievements() {
  if (cache) return cache;

  const dbc = readDbc(ACHIEVEMENT_DBC);
  const map = new Map();

  for (const row of dbc.rows) {
    const id = Number(row[0]);
    const name = dbc.string(row[4]);
    const description = dbc.string(row[21]);
    const points = Number(row[6] || 0);

    if (id) {
      map.set(id, {
        id,
        name: name || `Achievement #${id}`,
        description,
        points
      });
    }
  }

  cache = map;
  return cache;
}

function getAchievement(id) {
  const key = Number(id);
  return loadAchievements().get(key) || {
    id: key || 0,
    name: `Unknown Achievement (${key || "?"})`,
    description: "",
    points: 0
  };
}

function getAchievementName(id) {
  return getAchievement(id).name;
}

module.exports = {
  loadAchievements,
  getAchievement,
  getAchievementName
};
