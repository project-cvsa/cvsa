import argparse
import os
import numpy as np
import torch
import onnxruntime as ort
from model import VideoClassifierV3_15


def export_onnx(checkpoint_path: str, onnx_path: str, verify: bool = True) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(onnx_path)), exist_ok=True)

    model = VideoClassifierV3_15()
    state_dict = torch.load(checkpoint_path, map_location="cpu")
    model.load_state_dict(state_dict)
    model.eval()

    dummy_input = torch.randn(1, 3, 1024, dtype=torch.float32)

    torch.onnx.export(
        model,
        dummy_input,
        onnx_path,
        input_names=["channel_features"],
        output_names=["logits"],
        dynamic_axes={
            "channel_features": {0: "batch_size"},
            "logits": {0: "batch_size"},
        },
        opset_version=13,
        do_constant_folding=True,
    )

    if verify:
        with torch.no_grad():
            expected = model(dummy_input).numpy()
        session = ort.InferenceSession(onnx_path)
        actual = session.run(["logits"], {"channel_features": dummy_input.numpy()})[0]
        max_diff = float(np.max(np.abs(expected - actual)))
        if max_diff > 1e-4:
            raise RuntimeError(f"ONNX verification mismatch: max_diff={max_diff}")
        print(f"Exported and verified ONNX model at {onnx_path} (max_diff={max_diff:.6f})")
    else:
        print(f"Exported ONNX model to {onnx_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Export trained Akari checkpoint to ONNX")
    parser.add_argument(
        "--checkpoint",
        required=True,
        help="Path to PyTorch .pt state_dict checkpoint",
    )
    parser.add_argument(
        "--version",
        default="3.17",
        help="Target Akari model version (writes to ../model/akari/<version>.onnx by default)",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Explicit output ONNX path",
    )
    args = parser.parse_args()
    output_path = args.output or os.path.join(
        os.path.dirname(__file__), f"../model/akari/{args.version}.onnx"
    )
    export_onnx(args.checkpoint, output_path)


if __name__ == "__main__":
    main()
