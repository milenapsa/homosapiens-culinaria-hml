#!/bin/sh
set -eu
APP_CONTAINER="${APP_CONTAINER:-homosapiens-culinaria-hml}"
CADDY_CONTAINER="${CADDY_CONTAINER:-media-studio-caddy}"
HOSTNAME="${HML_HOSTNAME:-culinaria-hml.homosapiens.id}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="/backups/Caddyfile.before-culinaria-hml-${STAMP}"
echo "HML_CONFIGURE_START=${STAMP}"
docker inspect "$APP_CONTAINER" >/dev/null
docker inspect "$CADDY_CONTAINER" >/dev/null
mkdir -p /backups /work
docker cp "$CADDY_CONTAINER:/etc/caddy/Caddyfile" "$BACKUP"
cp "$BACKUP" /work/Caddyfile.current
docker inspect "$CADDY_CONTAINER" --format '{{range $k,$v := .NetworkSettings.Networks}}{{println $k}}{{end}}' > /work/caddy.networks
test -s /work/caddy.networks
while IFS= read -r net; do
  [ -n "$net" ] || continue
  docker network connect "$net" "$APP_CONTAINER" >/dev/null 2>&1 || true
done < /work/caddy.networks
awk '
  BEGIN {skip=0}
  $0=="# BEGIN HOMOSAPIENS_CULINARIA_HML" {skip=1; next}
  $0=="# END HOMOSAPIENS_CULINARIA_HML" {skip=0; next}
  skip==0 {print}
' /work/Caddyfile.current > /work/Caddyfile.new
cat >> /work/Caddyfile.new <<EOF

# BEGIN HOMOSAPIENS_CULINARIA_HML
${HOSTNAME} {
    encode zstd gzip
    header {
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
        X-Frame-Options SAMEORIGIN
        Permissions-Policy "camera=(), microphone=(), geolocation=()"
    }
    reverse_proxy ${APP_CONTAINER}:80
}
# END HOMOSAPIENS_CULINARIA_HML
EOF
restore() {
  echo "HML_CONFIGURE_RESTORE=${BACKUP}"
  docker cp "$BACKUP" "$CADDY_CONTAINER:/etc/caddy/Caddyfile"
  docker exec "$CADDY_CONTAINER" caddy fmt --overwrite /etc/caddy/Caddyfile >/dev/null 2>&1 || true
  docker exec "$CADDY_CONTAINER" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 || true
}
trap restore INT TERM HUP
docker cp /work/Caddyfile.new "$CADDY_CONTAINER:/etc/caddy/Caddyfile"
docker exec "$CADDY_CONTAINER" caddy fmt --overwrite /etc/caddy/Caddyfile || { restore; exit 1; }
docker exec "$CADDY_CONTAINER" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile || { restore; exit 1; }
docker exec "$CADDY_CONTAINER" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile || { restore; exit 1; }
FIRST_NET="$(head -n 1 /work/caddy.networks)"
docker run --rm --network "$FIRST_NET" curlimages/curl:8.11.1 -fsS "http://${APP_CONTAINER}/" | grep -q "HomoSapiens"
echo "$BACKUP" > /backups/LAST_CULINARIA_HML_BACKUP
echo "HML_CONFIGURE_OK"
echo "BACKUP=${BACKUP}"
