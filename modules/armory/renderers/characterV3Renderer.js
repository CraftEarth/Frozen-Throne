const itemIcons = require("../../../item-icons.json");
const enchantments = require("../../../public/data/spell-item-enchantments.json");
function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function itemIcon(item) {
  const icon = itemIcons[String(item.iconDisplayId || item.displayid || 0)];
  return icon ? `https://wow.zamimg.com/images/wow/icons/large/${icon}.jpg` : "";
}



const PAPER_DOLL_SLOTS = [
  [0, "Head"], [1, "Neck"], [2, "Shoulder"], [14, "Back"], [4, "Chest"],
  [3, "Shirt"], [18, "Tabard"], [8, "Wrist"], [9, "Hands"], [5, "Waist"],
  [6, "Legs"], [7, "Feet"], [10, "Ring"], [11, "Ring"], [12, "Trinket"],
  [13, "Trinket"], [15, "Main Hand"], [16, "Off Hand"], [17, "Ranged"]
];

function gearBySlot(items = []) {
  const map = new Map();
  for (const item of items) {
    const slot = Number(item.slot ?? item.equipSlot ?? item.inventorySlot ?? -1);
    if (!Number.isNaN(slot)) map.set(slot, item);
  }
  return map;
}

function renderPaperSlot(slot, label, item) {
  const iconUrl = item ? itemIcon(item) : "";
  const q = item ? esc(item.qualityClass || "q0") : "empty";
  const name = item ? esc(item.name) : esc(label);
  const tip = item ? esc(`${item.name} • ${item.itemLevel || item.ItemLevel || ""} • ${item.qualityName || ""}`) : esc(label);

  return `
    <div class="v3-paper-slot-icon ${q}" data-slot="${esc(slot)}" title="${tip}">
      ${iconUrl ? `<img src="${esc(iconUrl)}" alt="${name}">` : `<div class="v3-paper-empty">?</div>`}
      <small>${esc(label)}</small>
    </div>
  `;
}

function renderPaperDoll(items = []) {
  const bySlot = gearBySlot(items);

  const leftSlots = [0,1,2,14,4,3,18,8].map(slot => {
    const def = PAPER_DOLL_SLOTS.find(s => s[0] === slot);
    return renderPaperSlot(def[0], def[1], bySlot.get(slot));
  }).join("");

  const rightSlots = [9,5,6,7,10,11,12,13,15,16,17].map(slot => {
    const def = PAPER_DOLL_SLOTS.find(s => s[0] === slot);
    return renderPaperSlot(def[0], def[1], bySlot.get(slot));
  }).join("");

  return `
    <section class="card v3-paper-card">
      <h2>Equipment Paper Doll</h2>
      <div class="v3-paper-layout">
        <div class="v3-paper-model">
          <div class="v3-model-glow"></div>
          <div class="v3-paper-left">${leftSlots}</div>
          <div class="v3-model-placeholder">CHARACTER<br>MODEL</div>
          <div class="v3-paper-right">${rightSlots}</div>
        </div>
      </div>
    </section>
  `;
}

function gearTotals(items = []) {
  const totals = {};

  for (const item of items) {
    if (item.armor) totals.Armor = (totals.Armor || 0) + Number(item.armor || 0);

    for (const stat of item.stats || []) {
      totals[stat.name] = (totals[stat.name] || 0) + Number(stat.value || 0);
    }

    for (const id of item.insertedEnchantIds || []) {
      const name = enchantments[id]?.name || "";
      const m = name.match(/^\+([0-9]+)\s+(.+)$/);
      if (m) totals[m[2]] = (totals[m[2]] || 0) + Number(m[1]);
    }

    if (item.socketBonus && enchantments[item.socketBonus]?.name) {
      const name = enchantments[item.socketBonus].name;
      const m = name.match(/^\+([0-9]+)\s+(.+)$/);
      if (m) totals[m[2]] = (totals[m[2]] || 0) + Number(m[1]);
    }
  }

  return totals;
}

function renderGearTotals(items = []) {
  const totals = gearTotals(items);
  const order = [
    "Armor", "Strength", "Agility", "Stamina", "Intellect", "Spirit",
    "Defense Rating", "Dodge Rating", "Parry Rating", "Block Rating",
    "Hit Rating", "Crit Rating", "Haste Rating", "Expertise Rating",
    "Attack Power", "Armor Penetration"
  ];

  return `
    <section class="card v3-totals">
      <h2>Equipped Gear Totals</h2>
      <div class="v3-total-grid">
        ${order.filter(k => totals[k]).map(k => `
          <div><span>${esc(k)}</span><strong>${esc(totals[k])}</strong></div>
        `).join("")}
      </div>
    </section>
  `;
}


function renderItem(item) {
  const stats = (item.stats || [])
    .map(stat => `<li>+${esc(stat.value)} ${esc(stat.name)}</li>`)
    .join("");

  const armor = item.armor ? `<li>${esc(item.armor)} Armor</li>` : "";
  const damage = item.damage && item.damage.min && item.damage.max
    ? `<li>${esc(item.damage.min)} - ${esc(item.damage.max)} Damage</li>`
    : "";

  const gemEnchantIds = (item.insertedEnchantIds || [])
    .filter(id => enchantments[id] && enchantments[id].name)
    .filter(id => ![item.socketBonus].includes(id));

  const sockets = (item.sockets || [])
    .map((socket, index) => {
      const gemId = gemEnchantIds[index];
      const gemName = gemId && enchantments[gemId] ? enchantments[gemId].name : "";
      return `<li class="v3-socket socket-${esc(socket.colorName.toLowerCase())}">
        ${gemName ? `${esc(gemName)} <em>(${esc(socket.colorName)} Socket)</em>` : `${esc(socket.colorName)} Socket`}
      </li>`;
    })
    .join("");

  const socketBonusName = item.socketBonus && enchantments[item.socketBonus]
    ? enchantments[item.socketBonus].name
    : "";

  const socketBonus = item.socketBonus
    ? `<li class="v3-socket-bonus">Socket Bonus: ${esc(socketBonusName || item.socketBonus)}</li>`
    : "";

  const iconUrl = itemIcon(item);
  const iconHtml = iconUrl ? `<img class="v3-item-icon" src="${esc(iconUrl)}" alt="">` : "";

  return `
    <div class="v3-item ${esc(item.qualityClass || "q0")}">
      ${iconHtml}
      <strong>${esc(item.name)}</strong>
      <small>Entry ${esc(item.entry)} · iLvl ${esc(item.itemLevel || 0)} · ${esc(item.qualityName || "")}</small>
      <ul class="v3-item-stats">
        ${armor}
        ${damage}
        ${stats}
        ${sockets}
        ${socketBonus}
      </ul>
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
        ${renderPaperDoll(view.equipment || [])}

        <details class="v3-detail-list">
          <summary>Full Equipment Details</summary>
          <h2>Equipment Engine</h2>
          ${(view.equipment || []).map(renderItem).join("") || "<p>No equipment.</p>"}
        </details>
      </div>
    </section>

      ${renderGearTotals(view.equipment || [])}

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
