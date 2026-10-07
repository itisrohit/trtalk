#!/usr/bin/env bash
# TrTalk nightly backup (ADR-012): Postgres + media volume.
#
#   1. pg_dump (custom format, compressed) of the app database — verified
#      readable with pg_restore --list before it counts as a backup.
#   2. tar.gz of the media volume (voice notes / images).
#   3. Local copies kept BACKUP_KEEP_DAYS (default 14) in BACKUP_DIR.
#   4. Off-server copy to Cloudflare R2 when R2_* are set in the app .env
#      (kept R2_KEEP_DAYS, default 30). Unset → local only, with a warning.
#   5. Optional BACKUP_PING_URL (e.g. healthchecks.io) is pinged on success
#      and "<url>/fail" on failure, so a silently broken backup gets noticed.
#
# Runs on the Docker host (systemd timer: deploy/backup/trtalk-backup.timer).
# Only R2_* / BACKUP_* keys are read from the .env — it is never sourced.
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/trtalk}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"

# Read just the keys this script needs (the .env is compose syntax, not bash).
if [[ -f "$ENV_FILE" ]]; then
  while IFS='=' read -r key value; do
    value="${value%\"}"; value="${value#\"}"; value="${value%\'}"; value="${value#\'}"
    export "$key=$value"
  done < <(grep -E '^(R2_|BACKUP_)[A-Z0-9_]*=' "$ENV_FILE" || true)
fi

PROJECT="${BACKUP_COMPOSE_PROJECT:-trtalk}"
PG_CONTAINER="${PROJECT}-postgres-1"
MEDIA_VOLUME="${PROJECT}_storagedata"
DB_NAME="${BACKUP_DB_NAME:-trtalk}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/trtalk}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
R2_KEEP_DAYS="${R2_KEEP_DAYS:-30}"
STAMP="$(date -u +%Y%m%d-%H%M)"

log() { echo "[trtalk-backup] $*"; }

ping_monitor() {  # $1 = "" (success) or "/fail"
  [[ -n "${BACKUP_PING_URL:-}" ]] || return 0
  curl -fsS -m 10 --retry 3 "${BACKUP_PING_URL}$1" >/dev/null || log "WARN: monitor ping failed"
}
trap 'log "FAILED (line $LINENO)"; ping_monitor /fail' ERR

# One run at a time (a slow upload must not overlap the next night).
exec 9>/run/trtalk-backup.lock
flock -n 9 || { log "another backup is running; exiting"; exit 0; }

umask 077  # backups contain customer conversations
mkdir -p "$BACKUP_DIR/db" "$BACKUP_DIR/media"

# 1. Database ---------------------------------------------------------------
db_file="$BACKUP_DIR/db/${DB_NAME}-${STAMP}.dump"
docker exec "$PG_CONTAINER" pg_dump -U postgres -d "$DB_NAME" -Fc > "$db_file.tmp"
docker exec -i "$PG_CONTAINER" pg_restore --list < "$db_file.tmp" > /dev/null  # readable?
mv "$db_file.tmp" "$db_file"
log "database: $(du -h "$db_file" | cut -f1) → $db_file"

# 2. Media ------------------------------------------------------------------
media_file="$BACKUP_DIR/media/media-${STAMP}.tar.gz"
docker run --rm -v "${MEDIA_VOLUME}:/data:ro" alpine:3 tar -czf - -C /data . > "$media_file.tmp"
mv "$media_file.tmp" "$media_file"
log "media: $(du -h "$media_file" | cut -f1) → $media_file"

# 3. Local retention ----------------------------------------------------------
find "$BACKUP_DIR" -type f \( -name '*.dump' -o -name '*.tar.gz' \) -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -type f -name '*.tmp' -delete

# 4. Off-server copy (Cloudflare R2, S3-compatible via rclone) ----------------
if [[ -n "${R2_ACCOUNT_ID:-}" && -n "${R2_ACCESS_KEY_ID:-}" && -n "${R2_SECRET_ACCESS_KEY:-}" && -n "${R2_BUCKET:-}" ]]; then
  rclone() {
    docker run --rm -v "$BACKUP_DIR:/backups:ro" \
      -e RCLONE_CONFIG_R2_TYPE=s3 \
      -e RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
      -e RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
      -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
      -e RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
      -e RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true \
      rclone/rclone:1 "$@"
  }
  rclone copy /backups "r2:${R2_BUCKET}/trtalk" --include '*.dump' --include '*.tar.gz'
  rclone delete "r2:${R2_BUCKET}/trtalk" --min-age "${R2_KEEP_DAYS}d"
  log "off-server copy: r2:${R2_BUCKET}/trtalk (kept ${R2_KEEP_DAYS} days)"
else
  log "WARN: R2_* not set in $ENV_FILE — backup is on this server only"
fi

ping_monitor ""
log "done"
