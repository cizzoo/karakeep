#!/usr/bin/env bash
# Avvia web + workers in sviluppo usando il .env della root.
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Manca $ROOT/.env" >&2
  exit 1
fi

# Esporta tutte le variabili del .env nei processi figli (web e workers)
set -a
# shellcheck disable=SC1091
source .env
set +a

: "${DATA_DIR:?DATA_DIR non definito in .env}"
mkdir -p "$DATA_DIR"

echo "DATA_DIR=$DATA_DIR"
pnpm db:migrate

pids=()
cleanup() {
  trap - INT TERM EXIT
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

pnpm workers &
pids+=($!)
pnpm web &
pids+=($!)

# Esce appena uno dei due termina
wait -n
