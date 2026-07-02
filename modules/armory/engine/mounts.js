function buildMount(mount = {}) {
  return {
    id: mount.id || mount.spell || 0,
    name: mount.name || `Mount #${mount.id || mount.spell || 0}`,
    icon: mount.icon || "",
    type: mount.type || "",
    learned: Boolean(mount.learned ?? true)
  };
}

function buildMounts(mounts = []) {
  return mounts.map(buildMount);
}

module.exports = {
  buildMount,
  buildMounts
};
