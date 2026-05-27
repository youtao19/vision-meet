#!/bin/sh
set -eu

if [ -n "${KIMI_API_KEY:-}${KIMICODE_API_KEY:-}${MOONSHOT_API_KEY:-}" ]; then
  npm run agent:auth:kimi
else
  echo "[init] AI key not configured; skip Pi auth bootstrap"
fi

npm run knowledge:init
npm run jobs:import-seed
npm run job-portraits:seed
npm run knowledge:index:jobs -- --force
npm run knowledge:index:project-docs -- --force
