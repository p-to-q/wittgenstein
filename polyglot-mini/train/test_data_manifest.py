"""Tests for data_manifest helper. Run via:
    python -m unittest polyglot-mini.train.test_data_manifest
or, from inside polyglot-mini/train:
    python -m unittest test_data_manifest
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
import tempfile
import unittest

# Allow running both from repo root (`python -m unittest discover polyglot-mini/train`)
# and from inside polyglot-mini/train.
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import data_manifest as dm  # noqa: E402


def _write_jsonl(path: str, prompts: list[str]) -> None:
    with open(path, "w") as f:
        for p in prompts:
            f.write(json.dumps({"prompt": p, "params": {}}) + "\n")


class TestPromptsHash(unittest.TestCase):
    def test_canonical_hash_is_order_invariant(self):
        a = dm.prompts_canonical_sha256(["b", "a", "c"])
        b = dm.prompts_canonical_sha256(["c", "a", "b"])
        self.assertEqual(a, b)

    def test_canonical_hash_changes_on_membership(self):
        a = dm.prompts_canonical_sha256(["a", "b"])
        b = dm.prompts_canonical_sha256(["a", "c"])
        self.assertNotEqual(a, b)

    def test_canonical_hash_known_value(self):
        # Concrete fixture: "a\nb\nc" → SHA-256
        expected = hashlib.sha256(b"a\nb\nc").hexdigest()
        self.assertEqual(dm.prompts_canonical_sha256(["c", "a", "b"]), expected)


class TestBuildManifest(unittest.TestCase):
    def test_manifest_round_trip(self):
        with tempfile.TemporaryDirectory() as tmp:
            jsonl = os.path.join(tmp, "data.jsonl")
            _write_jsonl(jsonl, ["alpha", "beta", "gamma"])

            m1 = dm.build_manifest(output_path=jsonl, seed=7, n_requested=3)
            m2 = dm.build_manifest(output_path=jsonl, seed=7, n_requested=3)

            # Hashes deterministic across rebuilds of the same file.
            self.assertEqual(m1["output"]["sha256"], m2["output"]["sha256"])
            self.assertEqual(m1["promptsSha256"], m2["promptsSha256"])
            self.assertEqual(m1["nWritten"], 3)
            self.assertEqual(m1["seed"], 7)
            self.assertEqual(m1["nRequested"], 3)
            self.assertEqual(m1["version"], dm.MANIFEST_VERSION)
            self.assertEqual(m1["output"]["path"], "data.jsonl")

    def test_different_seed_recorded(self):
        with tempfile.TemporaryDirectory() as tmp:
            jsonl = os.path.join(tmp, "data.jsonl")
            _write_jsonl(jsonl, ["alpha", "beta", "gamma"])

            m_a = dm.build_manifest(output_path=jsonl, seed=7, n_requested=3)
            m_b = dm.build_manifest(output_path=jsonl, seed=42, n_requested=3)
            # Seed is honestly recorded — same file, different seed claim.
            self.assertNotEqual(m_a["seed"], m_b["seed"])

    def test_different_prompts_change_hashes(self):
        with tempfile.TemporaryDirectory() as tmp:
            a = os.path.join(tmp, "a.jsonl")
            b = os.path.join(tmp, "b.jsonl")
            _write_jsonl(a, ["alpha", "beta", "gamma"])
            _write_jsonl(b, ["alpha", "beta", "delta"])

            m_a = dm.build_manifest(output_path=a, seed=0, n_requested=3)
            m_b = dm.build_manifest(output_path=b, seed=0, n_requested=3)
            self.assertNotEqual(m_a["promptsSha256"], m_b["promptsSha256"])
            self.assertNotEqual(m_a["output"]["sha256"], m_b["output"]["sha256"])

    def test_write_manifest_emits_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            jsonl = os.path.join(tmp, "data.jsonl")
            manifest_path = os.path.join(tmp, "data_manifest.json")
            _write_jsonl(jsonl, ["alpha", "beta"])

            m = dm.build_manifest(output_path=jsonl, seed=0, n_requested=2)
            dm.write_manifest(m, manifest_path)

            with open(manifest_path) as f:
                loaded = json.load(f)
            self.assertEqual(loaded["promptsSha256"], m["promptsSha256"])
            self.assertEqual(loaded["nWritten"], 2)


if __name__ == "__main__":
    unittest.main()
