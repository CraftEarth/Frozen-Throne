import * as mod from "/vendor/wow-model-viewer/index.js";

async function bootArmoryLiveModel() {
  const el = document.getElementById("v3-live-character");
  if (!el) return;

  const loading = el.querySelector(".v3-live-loading");

  try {
    if (loading) loading.textContent = "Loading character...";

    // public debug disabled

    window.CONTENT_PATH = "/modelviewer/live/";
    window.WOTLK_TO_RETAIL_DISPLAY_ID_API = "/wotlk-items";

    const manifestUrl =
      el.dataset.manifestUrl ||
      (el.dataset.realm && el.dataset.guid
        ? `/api/armory-viewer/${el.dataset.realm}/${el.dataset.guid}`
        : "/renders/manifests/character-24-wowviewer.json");

    const character = await fetch(manifestUrl).then(r => {
      if (!r.ok) throw new Error(`Manifest failed ${r.status}: ${manifestUrl}`);
      return r.json();
    });

    if (character.equipments && mod.findItemsInEquipments) {
      character.items = await mod.findItemsInEquipments(character.equipments);
      // public debug disabled
    }

    el.innerHTML = '<div id="model_3d" style="width:100%;height:100%;"></div>';

    const viewer = await mod.generateModels(0.54, "#model_3d", character, "live");
    window.ftViewer = viewer;

    if (viewer?.setAzimuth) viewer.setAzimuth(4.71);
    if (viewer?.setDistance) viewer.setDistance(3.15);
    if (viewer?.setZenith) viewer.setZenith(1.45);

    el.classList.add("loaded");
  } catch (err) {
    console.error("[ArmoryLiveModel] failed", err);
    if (loading) loading.textContent = "3D viewer failed";
  }
}

bootArmoryLiveModel();
