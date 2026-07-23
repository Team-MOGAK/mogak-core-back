#!/bin/sh
set -eu

PGDATABASE="$POSTGRES_DB" createdb --username "$POSTGRES_USER" "$MOGAK_TEST_DB"
