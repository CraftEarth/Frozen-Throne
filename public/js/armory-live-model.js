import { WowModelViewer } from "/vendor/wow-model-viewer/index.js";

async function bootArmoryLiveModel() {
  const el = document.getElementById("v3-live-character");
  if (!el) return;

  const loading = el.querySelector(".v3-live-loading");

  try {
    if (loading) loading.textContent = "Starting viewer...";

    console.log("[ArmoryLiveModel] found", el.dataset);

    const viewer = new WowModelViewer(el, {
      manifestUrl: "/renders/manifests/character-24-wowviewer.json",
      background: false,
      controls: true
    });

    if (typeof viewer.load === "function") {
      await viewer.load();
    }

    if (loading) loading.remove();
    el.classList.add("loaded");
  } catch (err) {
    console.error("[ArmoryLiveModel] failed", err);
    if (loading) loading.textContent = "Viewer failed";
  }
}

window.addEventListener("DOMContentLoaded", bootArmoryLiveModel);
