#!/usr/bin/env bash
# Start a single local plaintext HydraDB dev node pinned to the digest validated
# in CP-001 (DEC-007). Data lives under ./.hydradb (git-ignored). Idempotent:
# re-running replaces any existing container. Waits for admin /readyz.
#
# The token below is HydraDB's documented *local development* token and is not a
# secret. Never reuse it for a deployed/TLS node.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAME="${HYDRADB_CONTAINER:-vurqel-hydradb}"
IMAGE="${HYDRADB_IMAGE:-ghcr.io/hydra-db/hydradb@sha256:db78309a233be54662db29744047e985a39b51c45a270d1a1f47c31a62cdb709}"
DATA_DIR="$ROOT/.hydradb"
TOKEN="${HYDRADB_TOKEN:-local-development-token-32-bytes}"

mkdir -p "$DATA_DIR"
# The pinned image's LocalFileSystem object store does not implement
# `put_opts(PutMode::Update)`, so writes against a store that already holds
# flushed data fail with an internal error. Vurqel's reproducible mode is a
# clean start (FR-015): wipe the ephemeral store on `up` by default. Set
# HYDRADB_KEEP_DATA=1 to preserve it (writes may then fail — read-only reuse).
if [ "${HYDRADB_KEEP_DATA:-0}" = "1" ]; then
  echo "HYDRADB_KEEP_DATA=1: reusing existing store at $DATA_DIR (writes may fail on a non-empty store)."
else
  rm -rf "$DATA_DIR/store" "$DATA_DIR/cache"
  echo "Clean start: reset ephemeral store at $DATA_DIR."
fi
mkdir -p "$DATA_DIR/store" "$DATA_DIR/cache"
printf '%s\n' "$TOKEN" > "$DATA_DIR/auth-token"

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" \
  --user "$(id -u):$(id -g)" \
  -p 7687:7687 -p 8443:8443 -p 9090:9090 \
  -v "$DATA_DIR:/data" \
  -e CLOUD_PROVIDER=local \
  -e LOCAL_PATH=/data/store \
  -e GRAPH_NAMESPACE=default \
  -e GRAPH_ID=default \
  -e GRAPH_CELL_ID=cell-0 \
  -e GRAPH_CELLS=cell-0 \
  -e GRAPH_NODE_ID=node-0 \
  -e GRAPH_BOLT_NODE_ADDRESSES=node-0=127.0.0.1:7687 \
  -e GRAPH_ADVERTISED_BOLT_ADDR=127.0.0.1:7687 \
  -e GRAPH_DATA_CACHE_DIR=/data/cache \
  -e GRAPH_AUTH_TOKEN_FILE=/data/auth-token \
  -e GRAPH_ALLOW_PLAINTEXT=true \
  -e RUST_MIN_STACK=33554432 \
  "$IMAGE" >/dev/null

echo "Started $NAME ($IMAGE). Waiting for readiness..."
for i in $(seq 1 60); do
  code="$(curl -sS -m 3 -o /dev/null -w "%{http_code}" http://127.0.0.1:9090/readyz 2>/dev/null || true)"
  if [ "$code" = "200" ]; then
    echo "HydraDB ready on http://127.0.0.1:8443 (admin :9090, bolt :7687)."
    exit 0
  fi
  sleep 2
done

echo "HydraDB did not become ready in time. Recent logs:" >&2
docker logs --tail 40 "$NAME" >&2 || true
exit 1
