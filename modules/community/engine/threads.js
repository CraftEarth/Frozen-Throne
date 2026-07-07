const { readForum, writeForum, nextId, cleanText, stripHtml } = require("./forum");
const { getBoard } = require("./categories");
const { isRewardableThread } = require("./rewards");

function listThreads(boardId) {
  boardId = Number(boardId);
  return readForum().threads
    .filter(t => Number(t.boardId) === boardId)
    .sort((a, b) => Number(b.pinned || 0) - Number(a.pinned || 0) || new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
}

function getThread(threadId) {
  threadId = Number(threadId);
  return readForum().threads.find(t => Number(t.id) === threadId) || null;
}

function createThread({ boardId, accountId, username, title, body }) {
  const forum = readForum();
  const board = getBoard(boardId);

  if (!board) throw new Error("Board not found");
  if (board.locked) throw new Error("Board is locked");

  title = cleanText(title);
  body = cleanText(body);

  if (title.length < 4) throw new Error("Thread title is too short");
  if (stripHtml(body).length < 20) throw new Error("Thread body is too short");

  const now = new Date().toISOString();

  const thread = {
    id: nextId(forum.threads),
    boardId: Number(boardId),
    accountId: Number(accountId || 0),
    username: cleanText(username || "Unknown"),
    title,
    body,
    pinned: false,
    locked: false,
    views: 0,
    replyCount: 0,
    rewardTokens: isRewardableThread(stripHtml(body)) ? 2 : 0,
    createdAt: now,
    updatedAt: now
  };

  forum.threads.push(thread);
  writeForum(forum);

  return thread;
}

module.exports = {
  listThreads,
  getThread,
  createThread
};
