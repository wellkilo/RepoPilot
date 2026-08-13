#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${ROOT_DIR}"

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example; review local credentials before real integrations."
fi

docker compose up -d postgres
pnpm install --registry=https://registry.npmjs.org
pnpm build

echo "RepoPilot initialized."
echo "Run: set -a && source .env && set +a && pnpm --filter @repopilot/control-plane start"
