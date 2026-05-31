from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from .vqgan_gate_audit import main as audit_main


class VqganGateAuditTests(unittest.TestCase):
    def test_writes_skipped_receipt_without_weights(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out_path = Path(tmp) / "audit.json"
            exit_code = audit_main(["--out", str(out_path)])

            self.assertEqual(exit_code, 0)
            parsed = json.loads(out_path.read_text(encoding="utf-8"))

            self.assertEqual(parsed["schema_version"], "m1b-vqgan-gate-audit.v0")
            self.assertEqual(parsed["status"], "blocked")
            self.assertEqual(parsed["gates"][0]["gate"], "C")
            self.assertEqual(parsed["gates"][0]["status"], "skipped")
            self.assertIn("issues/334", parsed["gates"][0]["tracker"])
            self.assertEqual(parsed["gates"][1]["gate"], "D")
            self.assertEqual(parsed["gates"][1]["status"], "skipped")
            self.assertIn("issues/335", parsed["gates"][1]["tracker"])

    def test_records_passed_metrics_when_empirical_inputs_are_present(self) -> None:
        with (
            tempfile.TemporaryDirectory() as tmp,
            mock.patch("shutil.which", side_effect=lambda cmd: "/usr/bin/node" if cmd == "node" else None),
        ):
            tmp_path = Path(tmp)
            weights = tmp_path / "decoder.pt"
            onnx = tmp_path / "decoder.onnx"
            roundtrip = tmp_path / "roundtrip.json"
            onnx_metrics = tmp_path / "onnx.json"
            out_path = tmp_path / "audit.json"

            weights.write_bytes(b"weights")
            onnx.write_bytes(b"onnx")
            roundtrip.write_text(
                json.dumps(
                    {
                        "roundtrip_passed": False,
                        "encode_consistent": True,
                        "decode_consistent": True,
                        "reencode_consistent": False,
                        "sample_count": 3,
                        "token_hamming_rate": 0.1211,
                        "reencode_token_hamming_rate": 0.1211,
                    }
                ),
                encoding="utf-8",
            )
            onnx_metrics.write_text(
                json.dumps(
                    {
                        "onnx_cpu_passed": True,
                        "cpu_decode_seconds": 1.25,
                        "output_shape": [256, 256, 3],
                    }
                ),
                encoding="utf-8",
            )

            exit_code = audit_main(
                [
                    "--out",
                    str(out_path),
                    "--weights",
                    str(weights),
                    "--onnx",
                    str(onnx),
                    "--roundtrip-json",
                    str(roundtrip),
                    "--onnx-json",
                    str(onnx_metrics),
                    "--lab-run-id",
                    "slurm-123",
                    "--hardware",
                    "lab-a100-node",
                    "--accelerator",
                    "A100",
                    "--torch-version",
                    "2.4.0",
                    "--onnxruntime-version",
                    "1.18.0",
                ]
            )

            self.assertEqual(exit_code, 0)
            parsed = json.loads(out_path.read_text(encoding="utf-8"))
            self.assertEqual(parsed["status"], "passed")
            self.assertEqual(parsed["environment"]["labRunId"], "slurm-123")
            self.assertEqual(parsed["environment"]["accelerator"], "A100")
            self.assertEqual(parsed["environment"]["torchVersion"], "2.4.0")
            self.assertEqual(parsed["environment"]["onnxRuntimeVersion"], "1.18.0")
            self.assertEqual(parsed["gates"][0]["metrics"]["roundtrip_passed"], False)
            self.assertEqual(parsed["gates"][0]["metrics"]["encode_consistent"], True)
            self.assertEqual(parsed["gates"][0]["metrics"]["decode_consistent"], True)
            self.assertEqual(parsed["gates"][0]["metrics"]["cross_device_parity"], "structural-only")
            self.assertEqual(parsed["gates"][0]["metrics"]["pass_check"]["passed"], True)
            self.assertEqual(parsed["gates"][1]["metrics"]["onnx_cpu_passed"], True)
            self.assertEqual(parsed["gates"][1]["metrics"]["pass_check"]["passed"], True)

    def test_blocks_when_metrics_are_missing_required_fields(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            weights = tmp_path / "decoder.pt"
            onnx = tmp_path / "decoder.onnx"
            roundtrip = tmp_path / "roundtrip.json"
            onnx_metrics = tmp_path / "onnx.json"
            out_path = tmp_path / "audit.json"

            weights.write_bytes(b"weights")
            onnx.write_bytes(b"onnx")
            roundtrip.write_text(json.dumps({"roundtrip_passed": True}), encoding="utf-8")
            onnx_metrics.write_text(json.dumps({"onnx_cpu_passed": True}), encoding="utf-8")

            exit_code = audit_main(
                [
                    "--out",
                    str(out_path),
                    "--weights",
                    str(weights),
                    "--onnx",
                    str(onnx),
                    "--roundtrip-json",
                    str(roundtrip),
                    "--onnx-json",
                    str(onnx_metrics),
                ]
            )

            self.assertEqual(exit_code, 0)
            parsed = json.loads(out_path.read_text(encoding="utf-8"))
            self.assertEqual(parsed["status"], "blocked")
            self.assertEqual(parsed["gates"][0]["metrics"]["pass_check"]["passed"], False)
            self.assertEqual(parsed["gates"][1]["metrics"]["pass_check"]["passed"], False)


if __name__ == "__main__":
    unittest.main()
