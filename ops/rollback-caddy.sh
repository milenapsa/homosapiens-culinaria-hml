#!/bin/sh
set -eu
CADDY_CONTAINER="${CADDY_CONTAINER:-media-studio-caddy}"
APP_CONTAINER="${APP_CONTAINER:-homosapiens-culinaria-hml}"
POINTER="/backups/LAST_CULINARIA_HML_BACKUP"
test -f "$POINTER"
BACKUP="$(cat "$POINTER")"
test -f "$BACKUP"
docker cp "$BACKUP" "$CADDY_CONTAINER:/etc/caddy/Caddyfile"
docker exec "$CADDY_CONTAINER" caddy fmt --overwrite /etc/caddy/Caddyfile
docker exec "$CADDY_CONTAINER" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec "$CADDY_CONTAINER" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
docker inspect "$CADDY_CONTAINER" --format '{{range $k,$v := .NetworkSettings.Networks}}{{println $k}}{{end}}' |
while IFS= read -r net; do
  [ -n "$net" ] || continue
  docker network disconnect "$net" "$APP_CONTAINER" >/dev/null 2>&1 || true
done
echo "HML_ROLLBACK_OK"
