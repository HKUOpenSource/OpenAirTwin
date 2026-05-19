#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_HOST="${HKU_RT_REMOTE_HOST:-defaultuser@100.65.77.20}"
REMOTE_ROOT="${HKU_RT_REMOTE_ROOT:-/home/defaultuser/HKU-RT/v3.0}"

mkdir -p "${ROOT_DIR}/scene"

rsync -a \
  --delete \
  --human-readable \
  --info=progress2,stats2 \
  --exclude 'cache/' \
  "${REMOTE_HOST}:${REMOTE_ROOT}/scene/" \
  "${ROOT_DIR}/scene/"
