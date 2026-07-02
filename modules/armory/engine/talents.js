const CLASS_TALENT_TREES = {
  1: ["Arms", "Fury", "Protection"],
  2: ["Holy", "Protection", "Retribution"],
  3: ["Beast Mastery", "Marksmanship", "Survival"],
  4: ["Assassination", "Combat", "Subtlety"],
  5: ["Discipline", "Holy", "Shadow"],
  6: ["Blood", "Frost", "Unholy"],
  7: ["Elemental", "Enhancement", "Restoration"],
  8: ["Arcane", "Fire", "Frost"],
  9: ["Affliction", "Demonology", "Destruction"],
  11: ["Balance", "Feral Combat", "Restoration"]
};

function getTalentTrees(classId) {
  return CLASS_TALENT_TREES[classId] || [];
}

function buildTalentSummary(character = {}, learnedTalents = []) {
  const trees = getTalentTrees(character.class);

  return {
    classId: character.class || 0,
    trees,
    learnedCount: learnedTalents.length,
    primaryTree: trees[0] || "Unknown",
    status: learnedTalents.length ? "loaded" : "empty"
  };
}

module.exports = {
  getTalentTrees,
  buildTalentSummary
};
