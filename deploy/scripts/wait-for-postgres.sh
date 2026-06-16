#!/bin/sh
set -e

host="${POSTGRES_HOST:-postgres}"
port="${POSTGRES_PORT:-5432}"
user="${POSTGRES_USER:-postgres}"
max_attempts="${POSTGRES_WAIT_MAX_ATTEMPTS:-30}"
sleep_seconds="${POSTGRES_WAIT_SLEEP_SECONDS:-2}"

attempt=1
while [ "$attempt" -le "$max_attempts" ]; do
  if python - <<'PY'
import os
import socket
import sys

host = os.environ.get("POSTGRES_HOST", "postgres")
port = int(os.environ.get("POSTGRES_PORT", "5432"))

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.settimeout(2)
try:
    sock.connect((host, port))
except OSError:
    sys.exit(1)
finally:
    sock.close()
sys.exit(0)
PY
  then
    echo "PostgreSQL is accepting connections at ${host}:${port}"
    exit 0
  fi

  echo "Waiting for PostgreSQL at ${host}:${port} (attempt ${attempt}/${max_attempts})..."
  attempt=$((attempt + 1))
  sleep "$sleep_seconds"
done

echo "PostgreSQL did not become ready in time" >&2
exit 1
