# @cvsa/crawler

The Bilibili data collection daemon and control plane for CVSA. It tracks video metrics, ingests historical milestone snapshots into TimescaleDB, and discovers new singing voice synthesis videos using the in-process Akari classifier.

## Architecture

- **Crawler Engine (`src/crawler/`)**: Video tracking queues (BullMQ + Redis), milestone rate estimation, snapshot ingestion, and discovery crawlers.
- **Classifier (`src/ml/`)**: In-process ONNX Runtime model (`akari`) evaluated against HuggingFace tokenizer embeddings.
- **Control Plane (`src/controlPlane/`)**: Elysia HTTP service exposing runtime metrics, network adapter policies, and manual tracking triggers.

## Development

```bash
# Start crawler daemon in watch mode
bun dev

# Run unit and integration tests
bun test
```

## Environment

| Variable | Description |
| --- | --- |
| `SNAPSHOT_DATABASE_URL` | TimescaleDB connection string (defaults to `cvsa_snapshot`) |
| `REDIS_URL` | Redis instance for scheduling queues and rate limiters |
| `CONTROL_API_TOKEN` | Bearer token required to access the control plane API |
| `CONTROL_API_PORT` | Port for the control plane (default `16413`) |
| `CRAWLER_MODEL_DIR` | Directory containing ONNX models (`./model`) |
