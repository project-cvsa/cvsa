-- Runs only once, while the `snapshot_data` volume is being initialized.
-- `POSTGRES_DB` (cvsa_snapshot) is created by the entrypoint; this adds the
-- database the crawler tests use plus the TimescaleDB extension its migrations
-- require. `test:setup` repeats both defensively for pre-existing volumes.
SELECT 'CREATE DATABASE cvsa_snapshot_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'cvsa_snapshot_test')\gexec

\connect cvsa_snapshot_test

CREATE EXTENSION IF NOT EXISTS timescaledb;
