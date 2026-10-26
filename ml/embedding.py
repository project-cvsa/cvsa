import os
from typing import List, Dict
import numpy as np
import torch
import onnxruntime as ort
from transformers import AutoTokenizer

DEFAULT_TOKENIZER = "alikia2x/jina-embedding-v3-m2v-1024"
DEFAULT_EMBEDDING_ONNX = os.path.join(
    os.path.dirname(__file__), "../model/embedding/model.onnx"
)


class JinaEmbeddingExtractor:
    """
    Extracts 1024-d embeddings using the exact same tokenizer & ONNX bag-of-tokens
    offset convention as the TypeScript runtime (`apps/crawler/src/ml/akari.ts`).
    """

    def __init__(
        self,
        model_path: str = DEFAULT_EMBEDDING_ONNX,
        tokenizer_name: str = DEFAULT_TOKENIZER,
    ):
        self.tokenizer = AutoTokenizer.from_pretrained(tokenizer_name)
        self.session = ort.InferenceSession(model_path)

    def encode_texts(self, texts: List[str]) -> np.ndarray:
        normalized = [t.strip() if t and t.strip() else "empty" for t in texts]
        encoded = self.tokenizer(
            normalized,
            add_special_tokens=False,
            return_attention_mask=False,
            return_tensors=None,
        )
        input_ids_list: List[List[int]] = encoded["input_ids"]

        lengths = [len(ids) for ids in input_ids_list]
        offsets = [0]
        running = 0
        for length in lengths[:-1]:
            running += length
            offsets.append(running)

        flattened = [token_id for ids in input_ids_list for token_id in ids]
        if not flattened:
            flattened = [0] * len(texts)
            offsets = list(range(len(texts)))

        inputs = {
            "input_ids": np.asarray(flattened, dtype=np.int64),
            "offsets": np.asarray(offsets, dtype=np.int64),
        }
        outputs = self.session.run(None, inputs)
        return np.asarray(outputs[0], dtype=np.float32)

    def encode_batch_channels(self, batch: Dict[str, List[str]]) -> torch.Tensor:
        """
        Args:
            batch: dict with keys 'title', 'description', 'tags' each mapping to a list of strings.
        Returns:
            Tensor of shape [batch_size, 3, 1024]
        """
        channels = []
        for key in ("title", "description", "tags"):
            emb = self.encode_texts(batch[key])
            channels.append(torch.from_numpy(emb))
        return torch.stack(channels, dim=1)
