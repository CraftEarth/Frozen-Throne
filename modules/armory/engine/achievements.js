const { getAchievementName } = require("../../dbc/achievements");

function buildAchievement(achievement = {}) {
  const id = Number(achievement.id || achievement.achievement || achievement.ID || 0);

  return {
    id,
    name: achievement.name || getAchievementName(id),
    description: achievement.description || "",
    points: Number(achievement.points || 0),
    icon: achievement.icon || "",
    category: achievement.category || "",
    earnedAt: achievement.earnedAt || achievement.date || null
  };
}

function buildAchievements(achievements = []) {
  return achievements.map(buildAchievement);
}

module.exports = {
  buildAchievement,
  buildAchievements
};
