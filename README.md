# CVSA Backend

The backend service for the **Chinese Vocal Synthesizer Archive (CVSA)** – a unified platform for the Chinese vocal synthesizer community.  
This service provides a RESTful API for the rest of the CVSA system and third parties to interact with.

## Tech Stack

| Layer       | Technology                                                                              |
| ----------- | --------------------------------------------------------------------------------------- |
| Runtime     | [Bun](https://bun.sh) – fast JavaScript runtime, package manager, and test runner       |
| Framework   | [Elysia](https://elysiajs.com) – high‑performance, type‑friendly web framework          |
| Database    | PostgreSQL                                                                              |
| ORM         | [Prisma](https://www.prisma.io) – type‑safe database client with migrations             |
| Testing     | Bun test (unit, integration, E2E)                                                       |

## Getting Started

### Prerequisites

-   [Bun](https://bun.sh) >= 1.3.10
-   PostgreSQL >= 18

### Installation

1. **Clone the repository**

    ```bash
    git clone https://github.com/project-cvsa/cvsa-backend
    cd cvsa-backend
    ```

2. **Install dependencies**

    ```bash
    bun install
    ```

3. **Set up environment variables**  
   Copy the example file and edit it with your database credentials:

    ```bash
    cp .env.example .env
    ```

    Required variables:

    ```ini
    DATABASE_URL="postgresql://user:password@localhost:5432/cvsa"
    ```

4. **Generate Prisma client and run migrations**

    ```bash
    bun db-gen          # generate Prisma Client
    bun migrate:dev     # apply migrations to your database
    ```

    (For production, use `bun migrate` with custom scripts.)

5. **Start the development server**

    ```bash
    bun dev
    ```

    The server will start at `http://localhost:16412` (configurable via `PORT`).

## Testing

We use Bun’s built‑in test runner.

Run all tests:

```bash
bun test
```

For a specific suite:

```bash
bun test:unit
bun test:integration
bun test:e2e
```

To set up the test database (requires `DATABASE_URL` pointing to a test database):

```bash
bun test:db:setup   # runs migrations and resets the test DB
```


## Project Structure

```
src/
├── containers.ts          # DI container wiring
├── index.ts               # App entry point
├── onAfterHandle.ts       # Global response handler
├── startMessage.ts        # Startup logging
├── lib/                   # Shared utilities
├── repositories/          # Data access layer
├── services/              # Business logic
├── routes/                # Elysia route definitions
└── schemas/               # Zod validation schemas
tests/                     # Unit, integration, E2E tests
prisma/                    # Prisma schema and migrations
```

## License

This project is licensed under the AGPLv3 License – see the [LICENSE](LICENSE) file for details.
