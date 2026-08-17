#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/var/www/frozenthrone}"
ENV_DIR="/etc/frozenthrone"
ENV_FILE="${ENV_DIR}/discord-events.env"
STATE_DIR="/var/lib/frozenthrone"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this installer as root."
  exit 1
fi

if [[ ! -x /usr/bin/node ]]; then
  echo "ERROR: /usr/bin/node was not found."
  exit 1
fi

if [[ ! -f "${PROJECT_DIR}/scripts/discord-event-reminder.js" ]]; then
  echo "ERROR: reminder script is missing from ${PROJECT_DIR}."
  exit 1
fi

echo "Create a Discord webhook in the channel that should receive event reminders."
echo "The URL will be stored only in ${ENV_FILE}; it will not be committed to Git."
echo
read -r -s -p "Paste the Discord webhook URL: " WEBHOOK_URL
echo

if [[ ! "${WEBHOOK_URL}" =~ ^https://([a-z0-9.-]+\.)?(discord\.com|discordapp\.com)/api/webhooks/ ]]; then
  echo "ERROR: That does not look like a Discord webhook URL."
  exit 1
fi

echo
echo "Mention options:"
echo "  Leave blank for no ping"
echo "  Type everyone to ping @everyone"
echo "  Paste an Event Alerts role ID to ping that role"
read -r -p "Mention option: " MENTION_OPTION

if [[ -z "${MENTION_OPTION}" ]]; then
  MENTION_OPTION="none"
elif [[ "${MENTION_OPTION,,}" == "everyone" || "${MENTION_OPTION,,}" == "@everyone" ]]; then
  MENTION_OPTION="everyone"
elif [[ "${MENTION_OPTION}" =~ ^[0-9]{15,22}$ ]]; then
  MENTION_OPTION="role:${MENTION_OPTION}"
else
  echo "ERROR: Mention option must be blank, everyone, or a numeric Discord role ID."
  exit 1
fi

install -d -o root -g www-data -m 0750 "${ENV_DIR}"
install -d -o www-data -g www-data -m 0750 "${STATE_DIR}"

TEMP_ENV="$(mktemp)"
trap 'rm -f "${TEMP_ENV}"' EXIT
umask 077
{
  printf 'DISCORD_EVENT_WEBHOOK_URL=%s\n' "${WEBHOOK_URL}"
  printf 'DISCORD_EVENT_MENTION=%s\n' "${MENTION_OPTION}"
  printf 'DISCORD_EVENT_TIME_ZONE=UTC\n'
  printf 'DISCORD_EVENT_SITE_URL=https://frozenthrone.co\n'
  printf 'DISCORD_EVENT_STATE_FILE=/var/lib/frozenthrone/discord-event-reminder.json\n'
} > "${TEMP_ENV}"
install -o root -g www-data -m 0640 "${TEMP_ENV}" "${ENV_FILE}"

install -o root -g root -m 0644 \
  "${PROJECT_DIR}/deploy/systemd/frozenthrone-discord-events.service" \
  /etc/systemd/system/frozenthrone-discord-events.service

install -o root -g root -m 0644 \
  "${PROJECT_DIR}/deploy/systemd/frozenthrone-discord-events.timer" \
  /etc/systemd/system/frozenthrone-discord-events.timer

chmod 0755 "${PROJECT_DIR}/scripts/discord-event-reminder.js"

systemctl daemon-reload
systemctl enable --now frozenthrone-discord-events.timer

echo
echo "Sending one safe connection test. Test messages never ping @everyone or roles."
runuser -u www-data -- \
  /usr/bin/node "${PROJECT_DIR}/scripts/discord-event-reminder.js" --test

echo
echo "DISCORD EVENT REMINDERS INSTALLED"
systemctl status frozenthrone-discord-events.timer --no-pager
systemctl list-timers frozenthrone-discord-events.timer --no-pager
