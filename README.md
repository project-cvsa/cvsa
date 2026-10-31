# CVSA

The official monorepo for the **Chinese Vocal Synthesizer Archive (CVSA)** — an open archive and platform for aggregating, cataloging, and preserving Chinese vocal synthesizer music and culture.

## Workspace Overview

```
cvsa/
├── apps/
│   ├── web/              # Astro + Solid SSR frontend
│   ├── backend/          # Elysia REST API & outbox service
│   ├── crawler/          # Bilibili video tracker, scheduler & crawler daemon
│   │   └── ml/           # Akari classifier training & ONNX export pipeline
│   ├── embedding/        # Standalone vector embedding REST service
│   ├── deploy/           # Production host deployment service
│   └── docs/             # Documentation site
├── packages/
│   ├── contracts/        # Shared API schemas (Zod), DTOs, error taxonomy
│   ├── catalog/          # Core catalog domain logic (songs, artists, singers)
│   ├── authentication/   # User authentication and RBAC (Better Auth)
│   ├── db/               # Primary PostgreSQL Drizzle schema & migrations
│   ├── snapshot-db/      # TimescaleDB snapshot & tracking persistence (Drizzle)
│   ├── network-scheduler/# HTTP client, rate limiter & proxy scheduler
│   ├── logger/           # Shared Pino logger
│   ├── observability/    # OpenTelemetry tracing instrumentation
│   ├── env/              # Type-safe environment validation
│   └── typescript-config/# Shared tsconfig presets
└── docker-compose.yml    # Single Compose stack for backing services & apps
```

## Quickstart

### Prerequisites

- [Bun](https://bun.sh) >= 1.4.2
- [Docker Compose](https://docs.docker.com/compose/) (for Postgres, TimescaleDB, Redis, and Meilisearch)

### 1. Clone & Configure

```bash
git clone https://github.com/project-cvsa/cvsa.git
cd cvsa

# Initialize local environment variables
cp .env.example .env
```

### 2. Start Backing Services

```bash
docker compose up -d db snapshot-db redis redis-cache meili
```

### 3. Install & Initialize Databases

```bash
bun install --frozen-lockfile

# Generate Prisma clients and prepare test databases
bun run setup
```

### 4. Run Development Servers

```bash
bun dev
```

- Web App: `http://localhost:10199`
- Backend API: `http://localhost:16412/v2`
- Crawler Control Plane: `http://localhost:16413/v2`
- Embedding Service: `http://localhost:14900`

## Common Commands

| Command | Description |
| --- | --- |
| `bun dev` | Start all services concurrently in watch mode |
| `bun run build` | Build all workspace packages and apps |
| `bun run ci` | Verify formatting and linting across the monorepo (Biome) |
| `bun run format` | Auto-format all files via Biome |
| `bun run typecheck` | Run TypeScript type checks across all workspaces |
| `bun run test` | Run unit, contract, and integration tests |
| `bun run setup` | Bootstrap Prisma clients and initialize databases |

## License

Licensed under the **GNU Affero General Public License v3.0** — see [LICENSE](LICENSE) for details.
