import argparse
import json
import os
from typing import List, Dict, Any
import numpy as np
import torch
from torch.utils.data import Dataset, DataLoader
import torch.optim as optim
from sklearn.metrics import f1_score, precision_score, recall_score, accuracy_score
from sklearn.model_selection import train_test_split

from model import VideoClassifierV3_15, AdaptiveRecallLoss
from embedding import JinaEmbeddingExtractor


class DiscoverySampleDataset(Dataset):
    def __init__(self, records: List[Dict[str, Any]]):
        self.records = records

    def __len__(self) -> int:
        return len(self.records)

    def __getitem__(self, idx: int) -> Dict[str, Any]:
        item = self.records[idx]
        tags = item.get("tags", [])
        tags_text = " ".join(tags) if isinstance(tags, list) else str(tags or "empty")
        return {
            "title": str(item.get("title") or "untitled"),
            "description": str(item.get("description") or "N/A"),
            "tags": tags_text or "empty",
            "label": int(item["label"]),
        }


def load_jsonl(path: str) -> List[Dict[str, Any]]:
    with open(path, "r", encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def evaluate(
    model: VideoClassifierV3_15,
    loader: DataLoader,
    extractor: JinaEmbeddingExtractor,
    device: str,
) -> Dict[str, float]:
    model.eval()
    preds: List[int] = []
    labels: List[int] = []

    with torch.no_grad():
        for batch in loader:
            features = extractor.encode_batch_channels(batch).to(device)
            logits = model(features)
            batch_preds = torch.argmax(logits, dim=1).cpu().tolist()
            preds.extend(batch_preds)
            labels.extend(batch["label"].tolist())

    return {
        "f1": float(f1_score(labels, preds, average="weighted", zero_division=0)),
        "recall": float(recall_score(labels, preds, average="weighted", zero_division=0)),
        "precision": float(precision_score(labels, preds, average="weighted", zero_division=0)),
        "accuracy": float(accuracy_score(labels, preds)),
    }


def train(
    data_path: str,
    checkpoint_out: str,
    embedding_onnx: str,
    epochs: int = 8,
    batch_size: int = 24,
    lr: float = 4e-4,
) -> None:
    records = load_jsonl(data_path)
    if len(records) < 10:
        raise ValueError(f"Need at least 10 labeled samples to train, found {len(records)}")

    train_records, eval_records = train_test_split(records, test_size=0.15, random_state=42)
    train_loader = DataLoader(DiscoverySampleDataset(train_records), batch_size=batch_size, shuffle=True)
    eval_loader = DataLoader(DiscoverySampleDataset(eval_records), batch_size=batch_size, shuffle=False)

    extractor = JinaEmbeddingExtractor(model_path=embedding_onnx)
    device = "cuda" if torch.cuda.is_available() else "cpu"

    all_labels = [int(r["label"]) for r in train_records]
    counts = np.bincount(all_labels, minlength=3)
    counts = np.maximum(counts, 1)
    median_freq = float(np.median(counts))
    class_weights = torch.tensor(
        [median_freq / float(c) for c in counts], dtype=torch.float32, device=device
    )

    model = VideoClassifierV3_15(output_dim=len(counts)).to(device)
    optimizer = optim.AdamW(model.parameters(), lr=lr)
    criterion = AdaptiveRecallLoss(class_weights=class_weights)

    os.makedirs(os.path.dirname(os.path.abspath(checkpoint_out)), exist_ok=True)
    best_f1 = -1.0

    for epoch in range(1, epochs + 1):
        model.train()
        total_loss = 0.0
        for batch in train_loader:
            optimizer.zero_grad()
            features = extractor.encode_batch_channels(batch).to(device)
            targets = batch["label"].to(dtype=torch.long, device=device)
            logits = model(features)
            loss = criterion(logits, targets)
            loss.backward()
            optimizer.step()
            total_loss += float(loss.item())

        metrics = evaluate(model, eval_loader, extractor, device)
        avg_loss = total_loss / max(1, len(train_loader))
        print(
            f"Epoch {epoch}/{epochs} | loss={avg_loss:.4f} | "
            f"f1={metrics['f1']:.4f} recall={metrics['recall']:.4f} "
            f"precision={metrics['precision']:.4f} acc={metrics['accuracy']:.4f}"
        )

        if metrics["f1"] > best_f1:
            best_f1 = metrics["f1"]
            torch.save(model.state_dict(), checkpoint_out)
            print(f"  Saved best checkpoint to {checkpoint_out} (f1={best_f1:.4f})")


def main() -> None:
    parser = argparse.ArgumentParser(description="Train Akari video classifier")
    parser.add_argument(
        "--data",
        default=os.path.join(os.path.dirname(__file__), "data/labeled_samples.jsonl"),
        help="Path to labeled JSONL dataset",
    )
    parser.add_argument(
        "--checkpoint-out",
        default=os.path.join(os.path.dirname(__file__), "checkpoints/best_model.pt"),
        help="Output path for best PyTorch checkpoint",
    )
    parser.add_argument(
        "--embedding-onnx",
        default=os.path.join(os.path.dirname(__file__), "../../../model/embedding/model.onnx"),
        help="Path to Jina 1024-d ONNX model",
    )
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--batch-size", type=int, default=24)
    parser.add_argument("--lr", type=float, default=4e-4)
    args = parser.parse_args()

    train(
        data_path=args.data,
        checkpoint_out=args.checkpoint_out,
        embedding_onnx=args.embedding_onnx,
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
    )


if __name__ == "__main__":
    main()
