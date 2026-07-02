#!/usr/bin/env bash
set -e

TARGET="$1"

if [ -z "$TARGET" ]; then
  echo "Recent checkpoints:"
  git log --oneline -10
  echo ""
  echo "Usage:"
  echo "./tools/rollback.sh <commit-hash>"
  exit 0
fi

echo "Rolling back to: $TARGET"
git checkout "$TARGET"

echo "Checking Node syntax..."
node --check server.js

echo "Restarting website..."
systemctl restart frozenthrone-web

echo "Checking website..."
sleep 2
systemctl status frozenthrone-web --no-pager -l | head -20

echo "Rollback complete."
