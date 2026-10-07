# Backups and restore

Nightly backup of the TrTalk database and media (design: ADR-012). Runs on the
Docker host from `deploy/backup/`.

| What | Where | Kept |
|---|---|---|
| Postgres dump (`pg_dump -Fc`, verified) | `/var/backups/trtalk/db/` | 14 days |
| Media volume (`tar.gz`) | `/var/backups/trtalk/media/` | 14 days |
| Off-server copy of both | Cloudflare R2: `<bucket>/trtalk/` | 30 days |

Schedule: every night at 21:30 UTC (03:00 IST), ±10 min.

## Install on the server (once)

```bash
cd /opt/trtalk && git pull
install -m 644 deploy/backup/trtalk-backup.service deploy/backup/trtalk-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now trtalk-backup.timer
systemctl start trtalk-backup.service          # first run now
journalctl -u trtalk-backup.service -n 20      # check it says "done"
```

## Off-server copy: Cloudflare R2

1. Cloudflare dashboard → **R2** → create a bucket (e.g. `trtalk-backups`).
2. R2 → **Manage API tokens** → create a token with **Object Read & Write**,
   scoped to that bucket. Note the *Access Key ID*, *Secret Access Key* and
   your *Account ID*.
3. Add to `/opt/trtalk/.env` on the server (never commit these):
   ```bash
   R2_ACCOUNT_ID=...
   R2_ACCESS_KEY_ID=...
   R2_SECRET_ACCESS_KEY=...
   R2_BUCKET=trtalk-backups
   ```
4. Run `systemctl start trtalk-backup.service` and check the journal shows
   `off-server copy: r2:...`.

Optional settings (same `.env`): `BACKUP_KEEP_DAYS` (local, default 14),
`R2_KEEP_DAYS` (default 30), `BACKUP_PING_URL` (a healthchecks.io-style URL,
pinged on success and `<url>/fail` on failure).

## Check that backups are running

```bash
systemctl list-timers trtalk-backup.timer      # next/last run
journalctl -u trtalk-backup.service --since -2d
ls -lh /var/backups/trtalk/db /var/backups/trtalk/media
```

## Restore

### Database

```bash
cd /opt/trtalk
FILE=/var/backups/trtalk/db/trtalk-YYYYMMDD-HHMM.dump

# Stop everything that writes to the database
docker compose -f docker-compose.yml -f docker-compose.evolution.yml \
  -f docker-compose.production.yml --profile evolution stop core evolution-gateway

docker exec -i trtalk-postgres-1 pg_restore -U postgres -d trtalk \
  --clean --if-exists --no-owner < "$FILE"

docker compose -f docker-compose.yml -f docker-compose.evolution.yml \
  -f docker-compose.production.yml --profile evolution start core evolution-gateway
```

**Rehearse without touching production data** by restoring into a scratch
database and comparing row counts:

```bash
docker exec trtalk-postgres-1 createdb -U postgres trtalk_restore_test
docker exec -i trtalk-postgres-1 pg_restore -U postgres -d trtalk_restore_test --no-owner < "$FILE"
docker exec trtalk-postgres-1 psql -U postgres -d trtalk_restore_test -c "select count(*) from messages;"
docker exec trtalk-postgres-1 dropdb -U postgres trtalk_restore_test
```

### Media

```bash
FILE=/var/backups/trtalk/media/media-YYYYMMDD-HHMM.tar.gz
docker compose ... stop storage
docker run --rm -v trtalk_storagedata:/data -v "$(dirname "$FILE")":/b:ro alpine:3 \
  sh -c "cd /data && tar -xzf /b/$(basename "$FILE")"
docker compose ... start storage
```

### From R2 (server lost)

On the new server, with the same `R2_*` values exported in the shell:

```bash
docker run --rm -v /var/backups/trtalk:/backups \
  -e RCLONE_CONFIG_R2_TYPE=s3 -e RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
  -e RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  -e RCLONE_CONFIG_R2_ENDPOINT="https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com" \
  rclone/rclone:1 copy "r2:$R2_BUCKET/trtalk" /backups
```

Then bring the stack up (`alembic upgrade head` creates an empty schema) and
follow the database and media restores above.
