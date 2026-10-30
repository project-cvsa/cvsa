# @cvsa/catalog

Core domain logic and data repository layer for CVSA's music catalog.

## Scope

Contains the business services and database access repositories for:
- Songs, lyrics, and song metadata
- Artists and artist roles
- Singers (virtual vocalists) and synthesizer engines
- Tags and categories

Adheres strictly to the layered architecture: `Handler -> Service -> Repository`. Handlers in `apps/backend` delegate business logic to services here, which invoke database repositories and throw structured `AppError` instances on failure.

## Development

```bash
# Run catalog domain unit tests with mocked repositories
bun test
```
