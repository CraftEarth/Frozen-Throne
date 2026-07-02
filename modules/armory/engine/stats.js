function buildStats(character = {}) {
  return {
    level: character.level || 1,
    health: character.health || 0,
    mana: character.mana || 0,
    strength: character.strength || 0,
    agility: character.agility || 0,
    stamina: character.stamina || 0,
    intellect: character.intellect || 0,
    spirit: character.spirit || 0
  };
}

module.exports = {
  buildStats
};
