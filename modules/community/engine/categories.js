const { readForum } = require("./forum");

function getCategories() {
  return readForum().categories;
}

function getCategory(id) {
  id = Number(id);
  return getCategories().find(c => c.id === id) || null;
}

function getBoards(categoryId) {
  categoryId = Number(categoryId);

  const category = getCategory(categoryId);

  return category ? category.boards : [];
}

function getBoard(boardId) {
  boardId = Number(boardId);

  for (const category of getCategories()) {
    const board = category.boards.find(b => b.id === boardId);

    if (board) {
      return {
        ...board,
        category
      };
    }
  }

  return null;
}

module.exports = {
  getCategories,
  getCategory,
  getBoards,
  getBoard
};
