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

    const viewer = await mod.generateModels(0.54, "#model_3d", character, "live");
    window.ftViewer = viewer;

// Debug viewer controls on screen
try {
  const box = document.createElement("pre");
  box.style.cssText = "position:absolute;left:4px;bottom:4px;z-index:50;background:#001018cc;color:#8ff;font-size:10px;max-width:95%;max-height:90px;overflow:auto;padding:6px;border:1px solid #38a;";
  box.textContent =
    "viewer proto:\\n" + Object.getOwnPropertyNames(Object.getPrototypeOf(viewer)).sort().join(", ") +
    "\\n\\nrenderer proto:\\n" + (viewer.renderer ? Object.getOwnPropertyNames(Object.getPrototypeOf(viewer.renderer)).sort().join(", ") : "no renderer") +
    "\\n\\nactor keys:\\n" + (viewer.renderer?.actors?.[0] ? Object.keys(viewer.renderer.actors[0]).sort().join(", ") : "no actor") +
    "\\n\\ncanvas:\\n" + (() => {
      const c = el.querySelector("canvas");
      return c ? ("attr " + c.width + "x" + c.height + " css " + c.clientWidth + "x" + c.clientHeight + " dpr " + window.devicePixelRatio) : "no canvas";
    })();
  // el.appendChild(box);
} catch(e) {}


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
