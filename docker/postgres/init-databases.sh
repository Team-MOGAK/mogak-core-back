#!/bin/sh
set -eu

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 \
  --set=test_database="$MOGAK_TEST_DB" \
  --command "SELECT format('CREATE DATABASE %I', :'test_database') \gexec"
