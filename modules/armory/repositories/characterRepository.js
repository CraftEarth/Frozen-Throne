async function getCharacterByGuid(charConn, guid) {
  const [rows] = await charConn.execute(
    `SELECT guid, account, name, race, class, gender, level, xp, money, online,
            totalKills, todayKills, zone, map, health,
            power1, power2, power3, power4, power5, power6, power7
     FROM characters
     WHERE guid = ? AND (deleteDate IS NULL OR deleteDate = 0)
     LIMIT 1`,
    [guid]
  );

  return rows[0] || null;
}

async function getCharacterGuild(charConn, guid) {
  const [rows] = await charConn.execute(
    `SELECT g.guildid AS id, g.name
     FROM guild_member gm
     JOIN guild g ON g.guildid = gm.guildid
     WHERE gm.guid = ?
     LIMIT 1`,
    [guid]
  );

  return rows[0] || null;
}

module.exports = {
  getCharacterByGuid,
  getCharacterGuild
};
