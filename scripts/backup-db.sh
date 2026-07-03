#!/bin/sh
# Backup bazy PostgreSQL do pliku .sql.gz z rotacją.
# Domyślnie zrzuca bazę z serwisu `postgres` w docker-compose.prod.yml.
#
# Użycie:
#   ./scripts/backup-db.sh                      # zrzut do ./backups/
#   BACKUP_DIR=/var/backups ./scripts/backup-db.sh
#   RETENTION_DAYS=14 ./scripts/backup-db.sh    # ile dni trzymać (domyślnie 7)
#
# W cronie (codziennie 3:00), z katalogu repo:
#   0 3 * * * cd /opt/opus-sales-app && ./scripts/backup-db.sh >> /var/log/opus-backup.log 2>&1
set -e

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
PG_USER="${POSTGRES_USER:-opus}"
PG_DB="${POSTGRES_DB:-opus}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%F_%H%M%S)"
OUT="$BACKUP_DIR/opus-${PG_DB}-${STAMP}.sql.gz"

echo "[backup-db] Zrzucam bazę '$PG_DB' (użytkownik '$PG_USER') -> $OUT"
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "$PG_USER" "$PG_DB" | gzip > "$OUT"

# Odrzuć puste/uszkodzone zrzuty (gzip mniejszy niż ~100 B = brak danych).
if [ "$(wc -c < "$OUT")" -lt 100 ]; then
  echo "[backup-db] BŁĄD: zrzut jest pusty — usuwam $OUT" >&2
  rm -f "$OUT"
  exit 1
fi

echo "[backup-db] OK ($(du -h "$OUT" | cut -f1)). Usuwam zrzuty starsze niż ${RETENTION_DAYS} dni."
find "$BACKUP_DIR" -name "opus-*.sql.gz" -type f -mtime "+${RETENTION_DAYS}" -delete

echo "[backup-db] Gotowe."
