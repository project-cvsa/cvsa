# @cvsa/db

Primary PostgreSQL database package for CVSA, managing catalog entities (songs, artists, singers, albums), user accounts, sessions, and system audit history.

## Available Scripts

| Script | Command | Description |
| --- | --- | --- |
| `gen` | `bun run gen` | Emit Prisma contract artifacts (`contract.json`, `contract.d.ts`) |
| `push` | `bun run push` | Apply schema updates directly to the active database |
| `migrate:plan` | `bun run migrate:plan` | Generate and plan schema migrations |
| `migrate:status` | `bun run migrate:status` | List migration history and pending status |
| `migrate:deploy` | `bun run migrate:deploy` | Apply pending migrations in production |
| `test:setup` | `bun run test:setup` | Provision the `cvsa_test` database and synchronize test schema |
| `studio` | `bun run studio` | Launch Prisma Studio web GUI |

## Environment

Reads `DATABASE_URL` from the environment or `.env` in the package/root. When running tests with `NODE_ENV=test`, defaults to the `cvsa_test` database on port 5432.
