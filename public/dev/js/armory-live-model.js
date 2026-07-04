async function bootArmoryLiveModel() {
  const el = document.getElementById("v3-live-character");
  if (!el) return;

  const loading = el.querySelector(".v3-live-loading");

  try {
    if (loading) loading.textContent = "Starting viewer...";

    window.CONTENT_PATH = "/modelviewer/live/";
    window.WOTLK_TO_RETAIL_DISPLAY_ID_API = "/wotlk-items";

    const mod = await import("/vendor/wow-model-viewer/index.js");

    const character = await fetch("/renders/manifests/character-24-wowviewer.json").then(r => r.json());

    if (character.equipments) {
      character.items = await mod.findItemsInEquipments(character.equipments);
    }

    el.innerHTML = '<div id="model_3d" style="width:100%;height:100%;"></div>';

    const viewer = await mod.generateModels(1.25, "#model_3d", character, "live");
    window.ftViewer = viewer;

    if (character.items) {
      for (const pair of character.items) {
        viewer.updateItemViewer(pair[0], pair[1], 0);
      }
    }

    el.classList.add("loaded");
  } catch (err) {
    console.error("[ArmoryLiveModel] failed", err);
    
if (loading) {
  loading.textContent = (err.message || String(err)).slice(0, 180);
}

  }
}

window.addEventListener("DOMContentLoaded", bootArmoryLiveModel);
