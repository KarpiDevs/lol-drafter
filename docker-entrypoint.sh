#!/bin/sh
set -e
# Primer arranque: crea la base, baja campeones y carga a Politécnica + comps
if [ ! -f "$DB_PATH" ]; then
  echo "No existe $DB_PATH, corriendo seed inicial..."
  node --import tsx src/seed.ts
fi
exec "$@"
