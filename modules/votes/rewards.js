const DEFAULT_VOTE_REWARD = {
  voteTokenItemId: 0,
  voteTokenCount: 1,
  gold: 1,
  emblemOfFrostItemId: 49426,
  emblemOfFrostCount: 5
};

const STREAK_REWARDS = [
  {
    streak: 150,
    type: "mount",
    itemId: 0,
    name: "Rare Vote Mount"
  }
];

module.exports = {
  DEFAULT_VOTE_REWARD,
  STREAK_REWARDS
};
