function buildGuild(guild = null) {
  if (!guild) {
    return {
      inGuild: false
    };
  }

  return {
    inGuild: true,
    id: guild.id || 0,
    name: guild.name || "",
    rank: guild.rank || "",
    members: guild.members || 0
  };
}

module.exports = {
  buildGuild
};
