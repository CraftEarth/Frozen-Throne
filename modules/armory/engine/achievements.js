function buildAchievement(achievement = {}) {
  return {
    id: achievement.id || achievement.achievement || 0,
    name: achievement.name || `Achievement #${achievement.id || achievement.achievement || 0}`,
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
