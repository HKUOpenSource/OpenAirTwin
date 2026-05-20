#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

if command -v python3.11 >/dev/null 2>&1; then
  PYTHON_BIN="python3.11"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
else
  echo "Python 3.11+ is required. Install Python first, then rerun install.sh." >&2
  exit 127
fi

exec "$PYTHON_BIN" "$SCRIPT_DIR/install.py" "$@"
