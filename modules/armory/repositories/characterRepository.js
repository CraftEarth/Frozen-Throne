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
    `SELECT
       g.guildid AS id,
       g.name,
       gm.rank AS rankId,
       COALESCE(gr.rname, CONCAT('Rank ', gm.rank)) AS rank,
       COUNT(roster.guid) AS members
     FROM guild_member gm
     JOIN guild g ON g.guildid = gm.guildid
     LEFT JOIN guild_rank gr ON gr.guildid = gm.guildid AND gr.rid = gm.rank
     LEFT JOIN guild_member roster ON roster.guildid = gm.guildid
     WHERE gm.guid = ?
     GROUP BY g.guildid, g.name, gm.rank, gr.rname
     LIMIT 1`,
    [guid]
  );

  return rows[0] || null;
}

module.exports = {
  getCharacterByGuid,
  getCharacterGuild
};
