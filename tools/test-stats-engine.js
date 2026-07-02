const { buildStats } = require("../modules/armory/engine/stats");

const stats = buildStats({
  level: 80,
  xp: 12345,
  health: 32000,
  power1: 9000,
  power2: 100,
  power4: 100,
  power7: 320,
  totalKills: 456,
  todayKills: 12,
  money: 12345678,
  map: 571,
  zone: 210,
  online: 1
});

console.log(JSON.stringify(stats, null, 2));
