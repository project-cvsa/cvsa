# CVSA

The official monorepo for the **Chinese Vocal Synthesizer Archive (CVSA)** – a unified platform that aggregates and preserves information about the Chinese vocal synthesizer community.

## Overview

CVSA is a community-driven archive that consolidates scattered information about Chinese singing voice synthesis community.

This monorepo contains all core components of the CVSA platform, managed with [Turborepo](https://turbo.build/repo) and [Bun](https://bun.sh).

## Project Structure

```
cvsa/
├── apps/
│   ├── backend/          # Core REST API service (Elysia + Prisma)
│   └── frontend/         # Astro SSR application with React islands (Not implemented yet)
├── packages/
│   ├── config/           # Shared configuration (TypeScript, etc.)
│   └── db/               # Prisma schema and database client
├── .github/              # GitHub workflows and issue templates
└── turbo.json            # Turborepo configuration
```

## Tech Stack

| Layer          | Technology                                            | Purpose                                               |
| -------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| **Runtime**    | [Bun](https://bun.sh)                                 | Fast JavaScript runtime, package manager, test runner |
| **Monorepo**   | [Turborepo](https://turbo.build)                      | Build system and task orchestration                   |
| **Frontend**   | [Astro](https://astro.build) + React                  | SSR with partial hydration (islands architecture)     |
| **Backend**    | [Elysia](https://elysiajs.com)                        | High-performance, type-safe API framework             |
| **Database**   | PostgreSQL + [TimescaleDB](https://www.timescale.com) | Core storage with time-series optimization            |
| **ORM**        | [Prisma](https://www.prisma.io)                       | Type-safe database client and migrations              |

## Getting Started

### Prerequisites

-   [Bun](https://bun.sh) >= 1.3.10
-   [PostgreSQL](https://www.postgresql.org) >= 18

### Initial Setup

1. **Clone the repository**

    ```bash
    git clone https://github.com/project-cvsa/cvsa
    cd cvsa
    ```

2. **Install dependencies**

    ```bash
    bun i
    ```

3. **Set up environment variables**

    Create `.env` and `.env.test` files in each service directory following their `.env.example` templates:

    ```bash
    cp apps/frontend/.env.example apps/frontend/.env
    cp apps/frontend/.env.example apps/frontend/.env.test
    cp packages/db/.env.example packages/db/.env
    cp packages/core/.env.example packages/core/.env.test
    ```

4. **Initialize the database**

    ```bash
    cd packages/db

    # Generate Prisma client
    bun db:gen

    # Run migrations
    bun db:migrate:dev
    ```

### Development

Start all services in development mode:

```bash
bun dev
```

## Available Scripts

| Command        | Description                            |
| -------------- | -------------------------------------- |
| `bun dev`      | Start all services in development mode |
| `bun build`    | Build all applications                 |
| `bun lint`     | Run Biome linter across the codebase   |
| `bun lint:fix` | Fix linting issues automatically       |
| `bun format`   | Format code with Biome                 |
| `bun test`     | Run tests across all packages          |

### Package-Specific Scripts

See each package's `README.md` for available scripts.

## License

This project is licensed under the **GNU Affero General Public License v3.0** – see the [LICENSE](LICENSE) file for details.
