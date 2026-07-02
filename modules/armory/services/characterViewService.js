const { buildCharacterView } = require("../engine/manager");

function buildCharacterProfileView(character, helpers = {}) {
  const engineView = buildCharacterView(character, helpers);

  return {
    character,
    engine: engineView,
    background: engineView.background,
    camera: engineView.camera,
    race: engineView.race
  };
}

module.exports = {
  buildCharacterProfileView
};
