from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from . import m1b_gate_c_roundtrip as gate_c
from . import m1b_gate_d_onnx_cpu as gate_d
from . import m1b_export_llamagen_decoder_onnx as export_onnx
from .vqgan_gate_audit import gate_c_passes, gate_d_passes


class M1BMetricProducerTests(unittest.TestCase):
    def test_gate_c_metric_shape_satisfies_receipt_hard_check(self) -> None:
        metrics = {
            "roundtrip_passed": True,
            "sample_count": 3,
            "token_hamming_rate": 0.0,
        }

        self.assertEqual(gate_c_passes(metrics)["passed"], True)

    def test_gate_d_metric_shape_satisfies_receipt_hard_check(self) -> None:
        metrics = {
            "onnx_cpu_passed": True,
            "cpu_decode_seconds": 1.25,
            "output_shape": [256, 256, 3],
        }

        self.assertEqual(gate_d_passes(metrics, node_available=True)["passed"], True)

    def test_gate_d_parse_shape_rejects_wrong_arity(self) -> None:
        with self.assertRaises(SystemExit):
            gate_d.parse_shape("256,256", 3, "--output-shape")

    def test_gate_d_normalizes_nchw_rgb_output(self) -> None:
        try:
            np = gate_d.import_numpy()
        except SystemExit:
            self.skipTest("numpy is not installed in this environment")
        output = np.zeros((1, 3, 256, 256), dtype=np.float32)

        normalized = gate_d.normalize_output(np, output)

        self.assertEqual(list(normalized.shape), [256, 256, 3])

    def test_gate_c_writes_sorted_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "metrics.json"
            gate_c.write_json(path, {"b": 1, "a": 2})

            self.assertEqual(json.loads(path.read_text(encoding="utf-8")), {"a": 2, "b": 1})

    def test_gate_c_environment_records_device(self) -> None:
        class TorchStub:
            __version__ = "test"

        env = gate_c.environment(TorchStub(), "cpu")

        self.assertEqual(env["device"], "cpu")
        self.assertEqual(env["torch_version"], "test")

    def test_gate_c_build_environment_args_are_parseable(self) -> None:
        args = gate_c.build_parser().parse_args(
            [
                "--llamagen-root",
                "/tmp/llamagen",
                "--vq-ckpt",
                "/tmp/vq.ckpt",
                "--sample-count",
                "3",
            ]
        )

        self.assertEqual(args.sample_count, 3)

    def test_gate_d_pick_input_reports_named_input_miss(self) -> None:
        class Input:
            name = "tokens"

        class Session:
            def get_inputs(self):
                return [Input()]

        with self.assertRaises(SystemExit):
            gate_d.pick_input(Session(), "other")

    def test_export_parser_defaults_to_decoder_onnx_artifact(self) -> None:
        args = export_onnx.build_parser().parse_args(
            [
                "--llamagen-root",
                "/tmp/llamagen",
                "--vq-ckpt",
                "/tmp/vq.ckpt",
            ]
        )

        self.assertEqual(args.out, "artifacts/m1b-audit/decoder.onnx")
        self.assertEqual(args.receipt, "artifacts/m1b-audit/gate-d-onnx-export.json")

    def test_export_latent_size_requires_divisible_downsample(self) -> None:
        args = export_onnx.build_parser().parse_args(
            [
                "--llamagen-root",
                "/tmp/llamagen",
                "--vq-ckpt",
                "/tmp/vq.ckpt",
                "--image-size",
                "255",
            ]
        )

        with self.assertRaises(SystemExit):
            export_onnx.latent_size(args)

    def test_gate_d_main_returns_nonzero_for_failed_metric(self) -> None:
        class Input:
            name = "tokens"
            shape = [1, 16, 16]
            type = "tensor(int64)"

        class Session:
            def __init__(self, path, providers):
                self.path = path
                self.providers = providers

            def get_inputs(self):
                return [Input()]

            def get_providers(self):
                return ["CPUExecutionProvider"]

            def run(self, _outputs, _feeds):
                np = gate_d.import_numpy()
                return [np.zeros((1, 3, 128, 128), dtype=np.float32)]

        class Ort:
            __version__ = "test"
            InferenceSession = Session

        with tempfile.TemporaryDirectory() as tmp:
            onnx = Path(tmp) / "decoder.onnx"
            out = Path(tmp) / "metrics.json"
            onnx.write_bytes(b"fake")
            original_import_onnxruntime = gate_d.import_onnxruntime
            try:
                gate_d.import_onnxruntime = lambda: Ort
                exit_code = gate_d.main(["--onnx", str(onnx), "--out", str(out)])
            finally:
                gate_d.import_onnxruntime = original_import_onnxruntime

            self.assertEqual(exit_code, 1)
            self.assertEqual(json.loads(out.read_text(encoding="utf-8"))["onnx_cpu_passed"], False)


if __name__ == "__main__":
    unittest.main()
