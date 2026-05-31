from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


def _scene(index: int) -> dict:
    return {
        "kind": "image_scene_spec",
        "prompt": f"bounded fixture scene {index}",
        "style": "ci-smoke",
        "decoder": {
            "family": "fixture-vqgan",
            "codebook": "fixture-codebook",
            "codebookVersion": "ci-smoke-v1",
            "latentResolution": [2, 2],
        },
    }


class TrainNumpySmokeTest(unittest.TestCase):
    def test_train_numpy_exports_mlp_json_contract(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmpdir = Path(tmp)
            data_path = tmpdir / "encoded.jsonl"
            out_path = tmpdir / "adapter_mlp_numpy.json"

            rows = [
                {
                    "image_scene_spec": _scene(i),
                    "target_tokens": [i % 8, (i + 1) % 8, (i + 2) % 8, (i + 3) % 8],
                    "codebook_size": 8,
                }
                for i in range(4)
            ]
            data_path.write_text(
                "".join(json.dumps(row, sort_keys=True) + "\n" for row in rows),
                encoding="utf-8",
            )

            script = Path(__file__).with_name("train_numpy.py")
            command = [
                sys.executable,
                str(script),
                "--data",
                str(data_path),
                "--out",
                str(out_path),
                "--epochs",
                "2",
                "--batch-size",
                "2",
                "--hidden",
                "8",
                "--seed",
                "7",
            ]
            try:
                result = subprocess.run(
                    command,
                    check=False,
                    text=True,
                    capture_output=True,
                    timeout=120,
                )
            except subprocess.TimeoutExpired as error:
                self.fail(
                    "train_numpy.py timed out "
                    f"after {error.timeout}s\nstdout:\n{error.stdout or ''}\n"
                    f"stderr:\n{error.stderr or ''}",
                )

            if result.returncode != 0:
                self.fail(
                    "train_numpy.py failed "
                    f"with exit {result.returncode}\nstdout:\n{result.stdout}\n"
                    f"stderr:\n{result.stderr}",
                )

            payload = json.loads(out_path.read_text(encoding="utf-8"))

        self.assertEqual(payload["version"], "witt.image.adapter.mlp/v0.1")
        self.assertEqual(
            payload["featureSchema"],
            "witt.image.adapter.features/sha256-canonical-json-v0",
        )
        self.assertEqual(payload["codebookSize"], 8)
        self.assertEqual(payload["tokenGrid"], [2, 2])
        self.assertEqual(payload["inputDim"], 128)
        self.assertEqual(payload["hiddenDim"], 8)
        self.assertEqual(payload["family"], "fixture-vqgan")
        self.assertEqual(payload["codebook"], "fixture-codebook")
        self.assertEqual(payload["codebookVersion"], "ci-smoke-v1")
        self.assertEqual(len(payload["w1"]), 8 * 128)
        self.assertEqual(len(payload["b1"]), 8)
        self.assertEqual(len(payload["w2"]), 4 * 8)
        self.assertEqual(len(payload["b2"]), 4)


if __name__ == "__main__":
    unittest.main()
