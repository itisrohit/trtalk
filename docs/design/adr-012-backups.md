# ADR-012 — Nightly backups: pg_dump + media tarball, local + Cloudflare R2

> **Status:** Accepted — 2026-10-08
> **Related:** ADR-002 (Postgres is the system of record), ADR-003 (media storage), `deploy/backup/`, `docs/BACKUPS.md`

## Context

TrTalk's Postgres is the only record of a deployment: conversation history the
agent reads every turn, leads, FAQ entries, the system prompt, tool config,
memories and the admin account. Channels do not give it back — the WhatsApp
Cloud API delivers each message once by webhook and keeps no archive the
business can download. Media (voice notes, images) lives in the S3-compatible
storage volume (ADR-003).

The first production VPS ran with **no backups at all**: one disk failure or a
bad migration would erase every customer conversation and lead.

## Decision

A host-level script, `deploy/backup/backup.sh`, run nightly by a systemd timer
(21:30 UTC = 03:00 IST):

1. **`pg_dump -Fc`** of the app database, then **`pg_restore --list`** on the
   file — an unreadable dump fails the run instead of silently "succeeding".
2. **`tar.gz` of the media volume.**
3. **14 days kept locally** in `/var/backups/trtalk` (root-only, `umask 077`)
   — fast restores after a bad deploy or an operator mistake.
4. **Off-server copy to Cloudflare R2** (S3-compatible, via the `rclone/rclone`
   image; 30 days) when `R2_*` keys are in the app `.env`. Local copies alone do
   not survive losing the server.
5. Optional **`BACKUP_PING_URL`** (healthchecks.io style): pinged on success
   and `/fail` on error, so a backup that stops running is noticed.

The script reads only `R2_*` / `BACKUP_*` keys from the `.env` (never sources
it), takes a `flock` so runs cannot overlap, and needs nothing installed on the
host beyond Docker (`pg_dump` runs inside the Postgres container; rclone and
tar run in throwaway containers).

## Alternatives considered

- **WAL archiving / point-in-time recovery (pgBackRest, wal-g).** Minutes of
  data loss instead of up to a day, but far more moving parts. Worth it once a
  day of lost conversations is unacceptable or the database reaches GBs;
  nightly `pg_dump` is the right size for a database measured in MB.
- **A backup sidecar container with cron.** Same result, but cron-in-Docker
  hides failures; a systemd timer gives `Persistent=` catch-up after downtime
  and logs in the journal.
- **Provider VPS snapshots only.** Whole-disk, coarse, and stored with the
  same provider/account as the server they protect.
- **Backblaze B2 / AWS S3.** Equivalent via rclone; R2 chosen for its free
  10 GB tier and zero egress fees on restore.

## Consequences

- Recovery point: up to 24 h of data loss (the time since the last run).
- Media is a full tarball each night — fine while media is small; switch to
  `rclone sync` of the bucket (incremental) once it grows to GBs.
- Restores are documented and were tested on the production VPS when this was
  introduced (`docs/BACKUPS.md`).
