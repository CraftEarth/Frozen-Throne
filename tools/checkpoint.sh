#!/usr/bin/env bash
set -e

MSG="$*"

if [ -z "$MSG" ]; then
  echo "Usage: ./tools/checkpoint.sh \"commit message\""
  exit 1
fi

echo "Checking Node syntax..."
node --check server.js

echo "Git status:"
git status --short

echo "Adding files..."
git add .

echo "Committing..."
git commit -m "$MSG" || {
  echo "Nothing to commit."
  exit 0
}

echo "Pushing to GitHub..."
git push

echo "Checkpoint complete."
