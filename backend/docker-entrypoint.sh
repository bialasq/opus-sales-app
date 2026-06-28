#!/bin/sh
# Entrypoint produkcyjny backendu.
# Uruchamia migracje Prisma (idempotentne, z advisory lock — bezpieczne przy wielu replikach)
# a następnie startuje serwer. Migracje można wyłączyć ustawiając RUN_MIGRATIONS=false
# (np. gdy migracje uruchamia osobny job CI/CD lub zewnętrzny orchestrator).
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] Stosuję migracje bazy danych (prisma migrate deploy)..."
  npx prisma migrate deploy
  echo "[entrypoint] Migracje zastosowane."
else
  echo "[entrypoint] RUN_MIGRATIONS=false — pomijam migracje."
fi

echo "[entrypoint] Start serwera: $*"
exec "$@"
