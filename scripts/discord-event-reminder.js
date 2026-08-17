#!/usr/bin/env node
"use strict";

const fs = require("fs");
const https = require("https");
const path = require("path");

const environmentFile = String(
  process.env.DISCORD_EVENT_ENV_FILE || "/etc/frozenthrone/discord-events.env"
);
if (fs.existsSync(environmentFile)) {
  require("dotenv").config({ path: environmentFile, quiet: true });
}

const WEBHOOK_URL = String(process.env.DISCORD_EVENT_WEBHOOK_URL || "").trim();
const MENTION = String(process.env.DISCORD_EVENT_MENTION || "none").trim().toLowerCase();
const SITE_URL = String(process.env.DISCORD_EVENT_SITE_URL || "https://frozenthrone.co").replace(/\/+$/, "");
const TIME_ZONE = String(process.env.DISCORD_EVENT_TIME_ZONE || "UTC").trim();
const STATE_FILE = String(
  process.env.DISCORD_EVENT_STATE_FILE ||
  "/var/lib/frozenthrone/discord-event-reminder.json"
);

const args = new Set(process.argv.slice(2));
const testMode = args.has("--test");
const forceMode = args.has("--force");
const dryRun = args.has("--dry-run");

const schedule = {
  Tuesday: [
    {
      id: "skill-surge",
      name: "⚒️ 3× Skill Surge",
      value:
        "Profession, gathering, crafting, and weapon skill gains are **3× faster today** on Shadowmourne. It is a perfect day to level professions, train a new weapon, and stock up on materials."
    }
  ],
  Thursday: [
    {
      id: "skill-surge",
      name: "⚒️ 3× Skill Surge",
      value:
        "Profession, gathering, crafting, and weapon skill gains are **3× faster today** on Shadowmourne. It is a perfect day to level professions, train a new weapon, and stock up on materials."
    }
  ],
  Friday: [
    {
      id: "weekend-xp",
      name: "⚔️ 3× XP Weekend",
      value:
        "Shadowmourne XP rates are now **3× through Sunday**. Earn increased experience from kills, quests, exploration, pets, battlegrounds, and other supported activities."
    }
  ],
  Saturday: [
    {
      id: "weekend-xp",
      name: "⚔️ 3× XP Weekend",
      value:
        "The **3× XP Weekend** continues today on Shadowmourne. Bring your alts, finish those quests, and make the most of the boosted experience rates."
    }
  ],
  Sunday: [
    {
      id: "weekend-xp",
      name: "⚔️ Final Day of 3× XP",
      value:
        "Today is the **final day of the Shadowmourne 3× XP Weekend**. Take advantage of the boosted rates before normal XP returns on Monday."
    }
  ]
};

function zonedDateParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return {
    weekday: parts.weekday,
    dateKey: `${parts.year}-${parts.month}-${parts.day}`
  };
}

function displayDate(date, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(date);
}

function readState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`Unable to read reminder state: ${error.message}`);
    }
    return {};
  }
}

function writeState(state) {
  const directory = path.dirname(STATE_FILE);
  fs.mkdirSync(directory, { recursive: true, mode: 0o750 });
  const temporary = `${STATE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o640 });
  fs.renameSync(temporary, STATE_FILE);
}

function mentionPayload() {
  if (MENTION === "everyone") {
    return {
      content: "@everyone",
      allowed_mentions: { parse: ["everyone"] }
    };
  }

  const roleMatch = MENTION.match(/^(?:role:)?(\d{15,22})$/);
  if (roleMatch) {
    return {
      content: `<@&${roleMatch[1]}>`,
      allowed_mentions: { parse: [], roles: [roleMatch[1]] }
    };
  }

  return { allowed_mentions: { parse: [] } };
}

function validateWebhook(value) {
  if (!value) throw new Error("DISCORD_EVENT_WEBHOOK_URL is not configured.");
  const target = new URL(value);
  const hostname = target.hostname.toLowerCase();
  const allowedHost = hostname === "discord.com"
    || hostname.endsWith(".discord.com")
    || hostname === "discordapp.com"
    || hostname.endsWith(".discordapp.com");

  if (target.protocol !== "https:" || !allowedHost || !target.pathname.includes("/api/webhooks/")) {
    throw new Error("The configured Discord webhook URL is not valid.");
  }
  return target;
}

function postWebhook(target, payload) {
  target.searchParams.set("wait", "true");
  const body = Buffer.from(JSON.stringify(payload));

  return new Promise((resolve, reject) => {
    const request = https.request(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": body.length,
        "User-Agent": "FrozenThrone-Event-Reminder/1.0"
      }
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const responseBody = Buffer.concat(chunks).toString("utf8");
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(responseBody);
          return;
        }
        reject(new Error(`Discord returned HTTP ${response.statusCode}: ${responseBody.slice(0, 500)}`));
      });
    });

    request.setTimeout(15000, () => request.destroy(new Error("Discord webhook timed out.")));
    request.on("error", reject);
    request.end(body);
  });
}

async function main() {
  const now = new Date();
  const { weekday, dateKey } = zonedDateParts(now, TIME_ZONE);
  const scheduledEvents = schedule[weekday] || [];
  let events = scheduledEvents;
  let syntheticTest = false;

  if (testMode && events.length === 0) {
    syntheticTest = true;
    events = [{
      id: "connection-test",
      name: "✅ Webhook Connected",
      value: "FrozenThrone event reminders are installed and ready. The next scheduled event will be announced automatically."
    }];
  }

  if (events.length === 0) {
    console.log(`${displayDate(now, TIME_ZONE)} has no configured Shadowmourne event. No reminder sent.`);
    return;
  }

  const reminderKey = `${dateKey}:${events.map((event) => event.id).join("+")}`;
  const state = readState();

  if (!testMode && !forceMode && state.lastReminderKey === reminderKey) {
    console.log(`Reminder ${reminderKey} was already sent. Skipping duplicate.`);
    return;
  }

  const ping = testMode ? { allowed_mentions: { parse: [] } } : mentionPayload();
  const payload = {
    ...ping,
    username: "FrozenThrone Event Herald",
    avatar_url: `${SITE_URL}/images/logo.png`,
    embeds: [{
      title: testMode && !syntheticTest
        ? "❄️ Event Reminders Connected — Today’s Event"
        : syntheticTest
          ? "❄️ FrozenThrone Event Reminders"
          : "❄️ Today on Shadowmourne",
      description: testMode && !syntheticTest
        ? "The Discord webhook is connected and automatic reminders are now active. Here is today’s live event:"
        : syntheticTest
          ? "The Discord webhook test succeeded. Automatic reminders will be posted on active event days."
          : "A scheduled realm event is active! Log in, gather your party, and take advantage of today’s bonuses.",
      color: 3447003,
      fields: [
        ...events.map((event) => ({ name: event.name, value: event.value, inline: false })),
        {
          name: "🌐 Realm",
          value: "Shadowmourne",
          inline: true
        },
        {
          name: "📅 Event Day",
          value: displayDate(now, TIME_ZONE),
          inline: true
        },
        {
          name: "🔗 Join the Adventure",
          value: `[Visit FrozenThrone](${SITE_URL})`,
          inline: false
        }
      ],
      image: { url: `${SITE_URL}/images/events.png` },
      thumbnail: { url: `${SITE_URL}/images/logo.png` },
      footer: { text: "FrozenThrone • Event days follow the realm’s UTC schedule" },
      timestamp: now.toISOString()
    }]
  };

  if (dryRun) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const target = validateWebhook(WEBHOOK_URL);
  await postWebhook(target, payload);

  if (!syntheticTest) {
    writeState({
      lastReminderKey: reminderKey,
      lastSentAt: now.toISOString(),
      weekday,
      events: events.map((event) => event.id)
    });
  }

  console.log(`Discord event reminder sent successfully for ${displayDate(now, TIME_ZONE)}.`);
}

main().catch((error) => {
  console.error(`Discord event reminder failed: ${error.message}`);
  process.exitCode = 1;
});
