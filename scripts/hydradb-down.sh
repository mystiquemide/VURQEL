#!/usr/bin/env bash
# Stop and remove the local HydraDB dev node started by hydradb-up.sh.
# Leaves ./.hydradb data in place unless PURGE=1.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAME="${HYDRADB_CONTAINER:-vurqel-hydradb}"

docker rm -f "$NAME" >/dev/null 2>&1 && echo "Removed $NAME." || echo "$NAME not running."

if [ "${PURGE:-0}" = "1" ]; then
  rm -rf "$ROOT/.hydradb"
  echo "Purged ./.hydradb."
fi
