#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

find "${ROOT_DIR}" \
  \( -name '__pycache__' -o -name '*.pyc' -o -name '.DS_Store' -o -name '._*' \) \
  -print

find "${ROOT_DIR}" \
  \( -name '__pycache__' -o -name '*.pyc' -o -name '.DS_Store' -o -name '._*' \) \
  -exec rm -rf {} +
