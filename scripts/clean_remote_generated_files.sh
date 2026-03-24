#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${HKU_RT_REMOTE_HOST:-defaultuser@100.65.77.20}"
REMOTE_ROOT="${HKU_RT_REMOTE_ROOT:-/home/defaultuser/HKU-RT/v3.0}"

ssh "${REMOTE_HOST}" "
  find '${REMOTE_ROOT}' \\
    \\( -name '__pycache__' -o -name '*.pyc' -o -name '.DS_Store' -o -name '._*' \\) \\
    -print &&
  find '${REMOTE_ROOT}' \\
    \\( -name '__pycache__' -o -name '*.pyc' -o -name '.DS_Store' -o -name '._*' \\) \\
    -exec rm -rf {} +
"
