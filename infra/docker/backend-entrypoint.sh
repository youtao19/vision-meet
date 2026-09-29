#!/bin/sh
set -eu

if [ -n "${KIMI_API_KEY:-}${KIMICODE_API_KEY:-}${MOONSHOT_API_KEY:-}${DEEPSEEK_API_KEY:-}" ]; then
  npm run agent:auth:kimi
else
  echo "[backend] AI key not configured; AI generation endpoints will be unavailable"
fi

npm run start -w career-backend
