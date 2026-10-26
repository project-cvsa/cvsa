-- Runs only once, while the `db` volume is being initialized.
-- `POSTGRES_DB` (cvsa) is created by the entrypoint; this adds the database
-- the integration tests use so a fresh cluster is usable immediately.
-- `test:setup` still creates it defensively for pre-existing volumes.
SELECT 'CREATE DATABASE cvsa_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'cvsa_test')\gexec
