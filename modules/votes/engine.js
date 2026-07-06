const fs = require("fs");
const path = require("path");

const VOTE_DATA_DIR = path.join(__dirname, "../../data/votes");
const VOTES_FILE = path.join(VOTE_DATA_DIR, "votes.json");

function ensureVoteStore() {
  fs.mkdirSync(VOTE_DATA_DIR, { recursive: true });

  if (!fs.existsSync(VOTES_FILE)) {
    fs.writeFileSync(VOTES_FILE, "[]");
  }
}

function readVotes() {
  ensureVoteStore();

  try {
    return JSON.parse(fs.readFileSync(VOTES_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeVotes(votes) {
  ensureVoteStore();
  fs.writeFileSync(VOTES_FILE, JSON.stringify(votes, null, 2));
}

module.exports = {
  readVotes,
  writeVotes
};
