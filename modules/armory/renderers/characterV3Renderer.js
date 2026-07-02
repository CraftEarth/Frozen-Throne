function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderItem(item) {
  return `
    <div class="v3-item ${esc(item.qualityClass || "q0")}">
      <strong>${esc(item.name)}</strong>
      <small>Entry ${esc(item.entry)} · iLvl ${esc(item.itemLevel || 0)} · ${esc(item.qualityName || "")}</small>
    </div>
  `;
}

function renderCharacterV3(view) {
  const c = view.character;
  const s = view.stats;

  return `
    <main class="container">
      <section class="card highlight">
        <h1>${esc(c.name)}</h1>
        <p>Level ${esc(s.level)} ${esc(view.race.name)} ${esc(c.class)}</p>
      </section>

      <section class="grid grid-2">
        <div class="card">
          <h2>Stats Engine</h2>
          <p>Health: ${esc(s.health)}</p>
          <p>Mana: ${esc(s.power.mana)}</p>
          <p>XP: ${esc(s.xp)}</p>
          <p>Money: ${esc(s.money)}</p>
          <p>Map: ${esc(s.location.map)} Zone: ${esc(s.location.zone)}</p>
        </div>

        <div class="card">
          <h2>Equipment Engine</h2>
          ${(view.equipment || []).map(renderItem).join("") || "<p>No equipment.</p>"}
        </div>
      </section>

      <section class="card">
        <h2>Inventory Engine</h2>
        ${(view.inventory || []).slice(0, 80).map(renderItem).join("") || "<p>No inventory.</p>"}
      </section>

      <section class="card">
        <h2>Talent Engine</h2>
        <p>${esc(view.talents.primaryTree)} · ${esc(view.talents.status)}</p>
        <p>${esc(view.talents.trees.join(" / "))}</p>
      </section>
    </main>
  `;
}

module.exports = { renderCharacterV3 };
