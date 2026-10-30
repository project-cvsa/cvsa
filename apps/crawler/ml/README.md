# CVSA Video Classifier ML Pipeline (`apps/crawler/ml/`)

This directory contains the Python training, evaluation, and ONNX export pipeline for the CVSA discovery video classifier (`akari`).

## Architecture
1. **Embedding Model**: `alikia2x/jina-embedding-v3-m2v-1024` (`model/embedding/model.onnx`)
   - Produces 1024-dimensional embeddings for 3 channels: `title`, `description`, `tags`.
2. **Classifier Model**: `VideoClassifierV3_15` (`model/akari/3.17.onnx`)
   - Input: `channel_features` of shape `[batch_size, 3, 1024]` (`float32`).
   - Output: `logits` of shape `[batch_size, 3]` (`float32`), where class `0` is non-song and classes `1, 2` are VOCALOID/SVS song categories (`songProbability = 1 - P(class 0)`).

## Scripts
- `export_samples.py`: Exports human-labeled `DiscoverySample` rows from `SNAPSHOT_DATABASE_URL` into `data/labeled_samples.jsonl`.
- `model.py`: PyTorch definition of `VideoClassifierV3_15` and `AdaptiveRecallLoss`.
- `embedding.py`: Computes 3×1024d channel features using `model/embedding/model.onnx` and `alikia2x/jina-embedding-v3-m2v-1024` tokenizer.
- `train.py`: Trains the classifier on exported JSONL samples and saves the best checkpoint.
- `export_onnx.py`: Exports a trained `.pt` checkpoint to `model/akari/<version>.onnx` with dynamic batch axis and verifies it with `onnxruntime`.
