#!/bin/sh
set -eu

PGDATABASE="$POSTGRES_DB" createdb --username "$POSTGRES_USER" mogak_test
