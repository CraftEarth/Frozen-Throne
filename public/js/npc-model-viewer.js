
import { generateModels, modelingType } from "/vendor/wow-model-viewer/index.js";

async function loadNpcModel() {
  const container = document.getElementById("npc-model-viewer");
  const modelHost = document.getElementById("npc-model-3d");
  if (!container || !modelHost) return;

  const displayId = Number(container.dataset.modelId || 0);
  const loading = container.querySelector(".npc-model-loading");
  if (!displayId) return;

  try {
    window.CONTENT_PATH = "/modelviewer/live/";

    const viewer = await generateModels(
      0.78,
      "#npc-model-3d",
      { id: displayId, type: modelingType.NPC },
      "live"
    );

    window.ftNpcViewer = viewer;

    if (viewer?.setAzimuth) viewer.setAzimuth(0);
    if (viewer?.setZenith) viewer.setZenith(1.5);
    if (viewer?.setDistance) viewer.setDistance(5.2);

    if (loading) loading.remove();
    container.classList.add("loaded");
  } catch (error) {
    console.error("[NpcModelViewer] failed", error);
    if (loading) loading.textContent =
      "This NPC model could not be displayed.";
  }
}

loadNpcModel();
