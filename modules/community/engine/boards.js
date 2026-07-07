const { readForum, writeForum, nextId, cleanText } = require("./forum");
const { getCategory } = require("./categories");

function listBoards() {
  return readForum().categories.flatMap(category =>
    category.boards.map(board => ({
      ...board,
      category
    }))
  );
}

function getBoard(boardId) {
  boardId = Number(boardId);
  return listBoards().find(b => Number(b.id) === boardId) || null;
}

function createBoard({ categoryId, name, description, icon = "💬", locked = false }) {
  const forum = readForum();
  const category = getCategory(categoryId);

  if (!category) throw new Error("Category not found");

  const board = {
    id: nextId(listBoards()),
    categoryId: Number(categoryId),
    name: cleanText(name),
    description: cleanText(description),
    icon: cleanText(icon || "💬"),
    locked: Boolean(locked),
    rewardMultiplier: 1,
    allowedTags: ["Question", "Guide", "Discussion", "PvP", "PvE"],
    createdAt: new Date().toISOString()
  };

  const target = forum.categories.find(c => Number(c.id) === Number(categoryId));
  target.boards.push(board);

  writeForum(forum);
  return board;
}

module.exports = {
  listBoards,
  getBoard,
  createBoard
};
