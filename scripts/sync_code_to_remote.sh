#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_HOST="${HKU_RT_REMOTE_HOST:-defaultuser@100.65.77.20}"
REMOTE_ROOT="${HKU_RT_REMOTE_ROOT:-/home/defaultuser/HKU-RT/v3.0}"

rsync -av \
  --delete \
  --exclude '__pycache__/' \
  --exclude '*.pyc' \
  --exclude '.DS_Store' \
  --exclude '._*' \
  "${ROOT_DIR}/backend/" \
  "${REMOTE_HOST}:${REMOTE_ROOT}/backend/"

rsync -av \
  --delete \
  --exclude '.DS_Store' \
  --exclude '._*' \
  "${ROOT_DIR}/docs/" \
  "${REMOTE_HOST}:${REMOTE_ROOT}/docs/"

rsync -av \
  --delete \
  --exclude '.DS_Store' \
  --exclude '._*' \
  "${ROOT_DIR}/scripts/" \
  "${REMOTE_HOST}:${REMOTE_ROOT}/scripts/"

rsync -av \
  "${ROOT_DIR}/README.md" \
  "${ROOT_DIR}/.gitignore" \
  "${REMOTE_HOST}:${REMOTE_ROOT}/"
