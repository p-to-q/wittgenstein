from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from .sweep_manifest import assert_training_sweep_manifest_shape


REPO_ROOT = Path(__file__).resolve().parents[3]


class TrainingSweepCliTests(unittest.TestCase):
    def test_smoke_sweep_cli_writes_portable_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_root = Path(tmp)
            snapshot_path = tmp_root / "synthetic-smoke.dataset.json"
            spec_path = tmp_root / "sweep.json"
            out_path = tmp_root / "sweep-manifest.json"
            run_root = tmp_root / "runs"
            spec_path.write_text(
                json.dumps(
                    {
                        "sweepId": "phase1-smoke-test",
                        "tracker": "https://github.com/p-to-q/wittgenstein/issues/400",
                        "rows": [
                            {
                                "rowId": "tokenizer-stdlib-smoke",
                                "subprogram": "tokenizer",
                                "datasetSnapshot": {
                                    "outPath": str(snapshot_path),
                                    "snapshotId": "synthetic-smoke-test",
                                    "dvcPath": "research/training/data/snapshots/synthetic-smoke.dvc",
                                    "name": "synthetic-manifest-smoke",
                                    "split": "smoke",
                                    "role": "smoke",
                                    "license": "permissive",
                                    "sampleCount": 1,
                                    "remoteName": "local-smoke",
                                    "repoRevLock": "smoke-local",
                                },
                                "command": [
                                    "python3",
                                    "-m",
                                    "research.training._shared.smoke_manifest",
                                ],
                            }
                        ],
                    }
                )
                + "\n",
                encoding="utf-8",
            )

            result = subprocess.run(
                [
                    sys.executable,
                    "bench/gpu/sweep.py",
                    "--spec",
                    str(spec_path),
                    "--out",
                    str(out_path),
                    "--run-root",
                    str(run_root),
                ],
                cwd=str(REPO_ROOT),
                capture_output=True,
                text=True,
                check=True,
            )
            payload = json.loads(out_path.read_text(encoding="utf-8"))
            stdout = json.loads(result.stdout)

        assert_training_sweep_manifest_shape(payload)
        self.assertTrue(stdout["ok"])
        self.assertEqual(payload["summary"]["passed"], 1)
        self.assertEqual(payload["summary"]["failed"], 0)
        self.assertEqual(payload["rows"][0]["status"], "passed")
        repo_prefix = str(REPO_ROOT)
        self.assertFalse(payload["source"]["specPath"].startswith(repo_prefix))
        self.assertFalse(payload["rows"][0]["trainingRun"]["manifestPath"].startswith(repo_prefix))
        self.assertFalse(payload["rows"][0]["experiment"]["receiptPath"].startswith(repo_prefix))

    def test_sweep_cli_marks_missing_torch_as_blocked_not_failed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_root = Path(tmp)
            snapshot_path = tmp_root / "synthetic-smoke.dataset.json"
            spec_path = tmp_root / "sweep.json"
            out_path = tmp_root / "sweep-manifest.json"
            spec_path.write_text(
                json.dumps(
                    {
                        "sweepId": "phase1-blocked-test",
                        "tracker": "https://github.com/p-to-q/wittgenstein/issues/400",
                        "rows": [
                            {
                                "rowId": "tokenizer-missing-torch",
                                "subprogram": "tokenizer",
                                "datasetSnapshot": {
                                    "outPath": str(snapshot_path),
                                    "snapshotId": "synthetic-smoke-test",
                                    "dvcPath": "research/training/data/snapshots/synthetic-smoke.dvc",
                                    "name": "synthetic-manifest-smoke",
                                    "split": "smoke",
                                    "role": "smoke",
                                    "license": "permissive",
                                    "sampleCount": 1,
                                    "remoteName": "local-smoke",
                                    "repoRevLock": "smoke-local",
                                },
                                "command": [
                                    sys.executable,
                                    "-c",
                                    "import sys; sys.stderr.write(\"ModuleNotFoundError: No module named 'torch'\\n\"); raise SystemExit(1)",
                                ],
                            }
                        ],
                    }
                )
                + "\n",
                encoding="utf-8",
            )

            result = subprocess.run(
                [
                    sys.executable,
                    "bench/gpu/sweep.py",
                    "--spec",
                    str(spec_path),
                    "--out",
                    str(out_path),
                ],
                cwd=str(REPO_ROOT),
                capture_output=True,
                text=True,
                check=True,
            )
            payload = json.loads(out_path.read_text(encoding="utf-8"))
            stdout = json.loads(result.stdout)

        assert_training_sweep_manifest_shape(payload)
        self.assertFalse(stdout["ok"])
        self.assertEqual(payload["summary"], {"total": 1, "passed": 0, "failed": 0, "skipped": 0, "blocked": 1})
        self.assertEqual(payload["rows"][0]["status"], "blocked")
        self.assertEqual(payload["rows"][0]["error"]["code"], "MISSING_TORCH")


if __name__ == "__main__":
    unittest.main()
