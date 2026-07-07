const { readForum, writeForum, nextId, cleanText, stripHtml } = require("./forum");
const { getThread } = require("./threads");
const { isRewardableReply } = require("./rewards");

function listPosts(threadId) {
  threadId = Number(threadId);
  return readForum().replies
    .filter(p => Number(p.threadId) === threadId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function createPost({ threadId, accountId, username, body }) {
  const forum = readForum();
  const thread = getThread(threadId);

  if (!thread) throw new Error("Thread not found");
  if (thread.locked) throw new Error("Thread is locked");

  body = cleanText(body);

  if (stripHtml(body).length < 10) throw new Error("Reply is too short");

  const now = new Date().toISOString();

  const post = {
    id: nextId(forum.replies),
    threadId: Number(threadId),
    accountId: Number(accountId || 0),
    username: cleanText(username || "Unknown"),
    body,
    rewardTokens: isRewardableReply(stripHtml(body)) ? 1 : 0,
    createdAt: now,
    updatedAt: now
  };

  forum.replies.push(post);

  const targetThread = forum.threads.find(t => Number(t.id) === Number(threadId));
  if (targetThread) {
    targetThread.replyCount = forum.replies.filter(r => Number(r.threadId) === Number(threadId)).length;
    targetThread.updatedAt = now;
  }

  writeForum(forum);
  return post;
}

module.exports = {
  listPosts,
  createPost
};
