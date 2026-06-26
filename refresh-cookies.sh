#!/usr/bin/env bash
# Extrae las cookies de Instagram de Chrome y las sube al servidor.
# Uso: ./refresh-cookies.sh [chrome|firefox|safari]
# Requiere: yt-dlp en el Mac (brew install yt-dlp)

set -euo pipefail

BROWSER="${1:-safari}"
SERVER="david@46.225.211.9"
CONTAINER="reeldown-reeldown-1"
TMP="$(mktemp /tmp/ig_cookies.XXXXXX.txt)"

trap 'rm -f "$TMP"' EXIT

echo "==> Extrayendo cookies de Instagram de $BROWSER..."
if ! yt-dlp \
  --cookies-from-browser "$BROWSER" \
  --cookies "$TMP" \
  --skip-download --quiet \
  'https://www.instagram.com/' 2>/dev/null; then
  echo "Error: no se pudo acceder a las cookies de $BROWSER."
  echo ""
  if [ "$BROWSER" = "safari" ]; then
    echo "  Safari requiere permiso de Acceso Total al Disco para el Terminal:"
    echo "  Ajustes del sistema → Privacidad y seguridad → Acceso total al disco"
    echo "  → añade Terminal.app (o iTerm.app) y vuelve a ejecutar el script."
  fi
  exit 1
fi

COUNT=$(grep -c "instagram.com" "$TMP" 2>/dev/null || echo 0)
if [ "$COUNT" -eq 0 ]; then
  echo "Error: no hay cookies de Instagram en $BROWSER. ¿Estás logado?"
  exit 1
fi
echo "   $COUNT cookies encontradas"

echo "==> Enviando al servidor..."
ssh "$SERVER" "docker exec -i $CONTAINER tee /data/cookies.txt > /dev/null" < "$TMP"

echo "==> Verificando..."
RESULT=$(ssh "$SERVER" "docker exec $CONTAINER yt-dlp \
  --cookies /data/cookies.txt --simulate --quiet --no-warnings \
  'https://www.instagram.com/reel/DaA87Q7MM8a/' 2>&1" || true)

if echo "$RESULT" | grep -qi "error"; then
  echo "Aviso: la verificación devolvió un error:"
  echo "  $RESULT"
  echo "Puede que el reel de prueba haya sido borrado. Prueba una descarga real."
else
  echo "==> Todo OK. Las cookies están activas."
fi
