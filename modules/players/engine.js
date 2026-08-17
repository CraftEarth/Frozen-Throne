const ALLIANCE_RACES = new Set([1, 3, 4, 7, 11]);
const HORDE_RACES = new Set([2, 5, 6, 8, 10]);
const VALID_CLASSES = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 11]);

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePlayer(row) {
  return {
    ...row,
    guid: number(row.guid),
    race: number(row.race),
    class: number(row.class),
    level: number(row.level),
    xp: number(row.xp),
    money: number(row.money),
    online: number(row.online),
    totalKills: number(row.totalKills),
    totaltime: number(row.totaltime),
    logout_time: number(row.logout_time),
    achievements: number(row.achievements),
    guildid: number(row.guildid),
    rankId: number(row.rankId)
  };
}

function factionOf(race) {
  const id = number(race);
  if (ALLIANCE_RACES.has(id)) return "alliance";
  if (HORDE_RACES.has(id)) return "horde";
  return "unknown";
}

function textCompare(a, b) {
  return String(a.name || "").localeCompare(String(b.name || ""));
}

function ranked(players, compare, limit = 10) {
  return [...players].sort(compare).slice(0, limit);
}

function normalizeFilters(input = {}) {
  const classId = Number(input.classId || input.class || 0);
  const faction = ["alliance", "horde"].includes(String(input.faction || "").toLowerCase())
    ? String(input.faction).toLowerCase()
    : "all";
  const status = ["online", "offline"].includes(String(input.status || "").toLowerCase())
    ? String(input.status).toLowerCase()
    : "all";

  return {
    search: String(input.search || input.q || "").trim().slice(0, 64),
    classId: VALID_CLASSES.has(classId) ? classId : 0,
    faction,
    status
  };
}

function filterDirectory(players, filters) {
  const search = filters.search.toLowerCase();
  return players.filter(player => {
    if (search && !`${player.name || ""} ${player.guildName || ""}`.toLowerCase().includes(search)) return false;
    if (filters.classId && player.class !== filters.classId) return false;
    if (filters.faction !== "all" && factionOf(player.race) !== filters.faction) return false;
    if (filters.status === "online" && player.online !== 1) return false;
    if (filters.status === "offline" && player.online === 1) return false;
    return true;
  });
}

function buildDashboard(players, inputFilters = {}) {
  const filters = normalizeFilters(inputFilters);
  const now = Math.floor(Date.now() / 1000);
  const byLevel = (a, b) => b.level - a.level || b.xp - a.xp || b.totalKills - a.totalKills || textCompare(a, b);
  const directoryPlayers = filterDirectory(players, filters)
    .sort((a, b) => b.online - a.online || b.level - a.level || textCompare(a, b));

  const classCandidates = ranked(players, (a, b) => a.class - b.class || byLevel(a, b), players.length);
  const classLeaderMap = new Map();
  for (const player of classCandidates) {
    if (VALID_CLASSES.has(player.class) && !classLeaderMap.has(player.class)) {
      classLeaderMap.set(player.class, player);
    }
  }

  return {
    filters,
    summary: {
      totalCharacters: players.length,
      onlineNow: players.filter(player => player.online === 1).length,
      maxLevel: players.filter(player => player.level >= 80).length,
      averageLevel: players.length
        ? Math.round(players.reduce((sum, player) => sum + player.level, 0) / players.length)
        : 0,
      totalKills: players.reduce((sum, player) => sum + player.totalKills, 0),
      totalAchievements: players.reduce((sum, player) => sum + player.achievements, 0),
      activeSevenDays: players.filter(player => player.online === 1 || (player.logout_time && now - player.logout_time <= 604800)).length,
      alliance: players.filter(player => factionOf(player.race) === "alliance").length,
      horde: players.filter(player => factionOf(player.race) === "horde").length
    },
    topLevel: ranked(players, byLevel),
    topGold: ranked(players, (a, b) => b.money - a.money || byLevel(a, b)),
    topKills: ranked(players, (a, b) => b.totalKills - a.totalKills || byLevel(a, b)),
    mostPlayed: ranked(players, (a, b) => b.totaltime - a.totaltime || byLevel(a, b)),
    topAchievements: ranked(players, (a, b) => b.achievements - a.achievements || byLevel(a, b)),
    recentlyActive: ranked(players, (a, b) => b.online - a.online || b.logout_time - a.logout_time || byLevel(a, b)),
    onlineNow: ranked(players.filter(player => player.online === 1), byLevel, 50),
    classLeaders: [...classLeaderMap.values()].sort((a, b) => a.class - b.class),
    directory: directoryPlayers.slice(0, 100),
    directoryMatches: directoryPlayers.length
  };
}

module.exports = function createPlayersEngine(tools) {
  const { characterDb, publicCharacterFilter } = tools;

  async function loadPlayers(realm) {
    const connection = await characterDb(realm);
    try {
      const [rows] = await connection.execute(`
        SELECT
          c.guid,
          c.name,
          c.race,
          c.class,
          c.level,
          c.xp,
          c.money,
          c.online,
          c.totalKills,
          c.totaltime,
          c.logout_time,
          COALESCE(achievement_totals.achievements, 0) AS achievements,
          COALESCE(g.guildid, 0) AS guildid,
          g.name AS guildName,
          gm.rank AS rankId,
          gr.rname AS rankName
        FROM characters c
        LEFT JOIN (
          SELECT guid, COUNT(*) AS achievements
          FROM character_achievement
          GROUP BY guid
        ) achievement_totals ON achievement_totals.guid = c.guid
        LEFT JOIN guild_member gm ON gm.guid = c.guid
        LEFT JOIN guild g ON g.guildid = gm.guildid
        LEFT JOIN guild_rank gr ON gr.guildid = gm.guildid AND gr.rid = gm.rank
        WHERE ${publicCharacterFilter(realm, "c")}
        ORDER BY c.guid ASC
        LIMIT 5000
      `);
      return rows.map(normalizePlayer);
    } finally {
      await connection.end();
    }
  }

  async function dashboard(realm, filters = {}) {
    return buildDashboard(await loadPlayers(realm), filters);
  }

  return {
    dashboard,
    factionOf,
    normalizeFilters
  };
};

module.exports.ALLIANCE_RACES = ALLIANCE_RACES;
module.exports.HORDE_RACES = HORDE_RACES;
module.exports.VALID_CLASSES = VALID_CLASSES;
