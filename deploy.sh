#!/usr/bin/env bash
# Descarga la última imagen de GHCR y reinicia el stack.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

if [ -f .env ]; then
  set -a; . ./.env; set +a
fi

echo "==> Actualizando repo"
git pull --ff-only || echo "   (git pull omitido)"

echo "==> Descargando imagen"
docker compose -f docker-compose.shared.yml pull

echo "==> Reiniciando stack"
docker compose -f docker-compose.shared.yml up -d

docker image prune -f >/dev/null || true
echo "==> Listo. https://${REELDOWN_HOST:-reels.ojoalprecio.com}"
