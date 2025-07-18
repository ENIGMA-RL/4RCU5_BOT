#!/bin/bash
cd /home/youruser/discord-bot

echo "[+] Pulling latest code..."
git pull origin main

if git diff --name-only HEAD@{1} HEAD | grep -E 'package(-lock)?\.json'; then
  echo "[+] Detected dependency changes. Running npm install..."
  npm install
else
  echo "[✓] No dependency changes. Skipping npm install."
fi

echo "[+] Running tests..."
npm test

if [ $? -ne 0 ]; then
  echo "[✗] Tests failed. Aborting deployment."
  exit 1
fi

echo "[✓] Tests passed. Reloading bot..."
pm2 reload ecosystem.config.js 