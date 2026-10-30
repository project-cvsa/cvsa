# @cvsa/contracts

Shared API schemas, data transfer objects (DTOs), and error taxonomy for CVSA.

## Purpose

This package is the single source of truth for contract definitions across the monorepo:
- **Validation Schemas**: Zod schemas for all incoming request bodies, queries, and parameters.
- **DTO Types**: TypeScript types inferred directly from Zod schemas via `z.infer`.
- **Error Taxonomy**: `AppError` base class and `ErrorCodeEnum` codes mapped across backend and clients.

## Development

```bash
# Run schema and validation tests
bun test
```
