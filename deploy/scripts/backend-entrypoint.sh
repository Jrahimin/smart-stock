#!/bin/sh
set -e

/app/deploy/scripts/wait-for-postgres.sh
exec "$@"
