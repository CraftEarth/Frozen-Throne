const RULES = {
  threadRewardTokens: 2,
  replyRewardTokens: 1,
  minThreadChars: 80,
  minReplyChars: 40,
  maxRewardedThreadsPerDay: 5,
  maxRewardedRepliesPerDay: 25
};

function isRewardableThread(body) {
  return String(body || "").trim().length >= RULES.minThreadChars;
}

function isRewardableReply(body) {
  return String(body || "").trim().length >= RULES.minReplyChars;
}

module.exports = {
  RULES,
  isRewardableThread,
  isRewardableReply
};
