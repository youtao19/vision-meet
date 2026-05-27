#!/bin/sh
set -eu

if [ -n "${KIMI_API_KEY:-}${KIMICODE_API_KEY:-}${MOONSHOT_API_KEY:-}" ]; then
  npm run agent:auth:kimi
else
  echo "[backend] AI key not configured; AI endpoints will require Pi auth before use"
fi

npm run start -w career-backend
