function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function buildStats(character = {}) {
  const health = number(character.health);
  const mana = number(character.power1 ?? character.mana);
  const rage = number(character.power2);
  const focus = number(character.power3);
  const energy = number(character.power4);
  const happiness = number(character.power5);
  const runes = number(character.power6);
  const runicPower = number(character.power7);

  return {
    level: number(character.level, 1),
    xp: number(character.xp),
    health,
    power: {
      mana,
      rage,
      focus,
      energy,
      happiness,
      runes,
      runicPower
    },
    kills: {
      total: number(character.totalKills),
      today: number(character.todayKills)
    },
    money: number(character.money),
    location: {
      map: number(character.map),
      zone: number(character.zone)
    },
    online: Boolean(character.online)
  };
}

module.exports = {
  buildStats
};
