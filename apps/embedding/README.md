# @cvsa/embedding

Standalone vector embedding microservice for CVSA. It exposes an HTTP endpoint to compute dense vector embeddings via ONNX Runtime for semantic search indexing.

## Development

```bash
# Start embedding service in watch mode (http://localhost:14900)
bun dev

# Run integration tests
bun test
```

## Environment

| Variable | Description |
| --- | --- |
| `PORT` | Listening port (default `14900`) |
| `HOST` | Bind host (default `0.0.0.0`) |
| `MODEL_DIR` | Path to local model directory containing embedding ONNX assets |
| `HF_HOME` | Cache directory for downloaded HuggingFace tokenizers |
