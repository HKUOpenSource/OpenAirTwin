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
  "${REMOTE_HOST}:${REMOTE_ROOT}/backend/" \
  "${ROOT_DIR}/backend/"

rsync -av \
  --delete \
  --exclude '.DS_Store' \
  --exclude '._*' \
  "${REMOTE_HOST}:${REMOTE_ROOT}/docs/" \
  "${ROOT_DIR}/docs/"

rsync -av \
  --delete \
  --exclude '.DS_Store' \
  --exclude '._*' \
  "${REMOTE_HOST}:${REMOTE_ROOT}/scripts/" \
  "${ROOT_DIR}/scripts/"

rsync -av \
  "${REMOTE_HOST}:${REMOTE_ROOT}/README.md" \
  "${REMOTE_HOST}:${REMOTE_ROOT}/.gitignore" \
  "${ROOT_DIR}/"
