from __future__ import annotations

import json
import unittest
from pathlib import Path


FIXTURE = Path(__file__).parent / "fixtures" / "phase0b-semantic-ir-sensitivity.fixture.json"


class Phase0BSemanticIRSensitivityFixtureTests(unittest.TestCase):
    def test_fixture_records_hash_baseline_not_semantic_alignment(self) -> None:
        receipt = json.loads(FIXTURE.read_text(encoding="utf-8"))

        self.assertEqual(
            receipt["schemaVersion"],
            "witt.research.phase0b-semantic-ir-sensitivity/v0.1",
        )
        self.assertEqual(receipt["issue"], 452)
        self.assertEqual(receipt["adapter"]["codePath"], "visual-seed-code")
        self.assertEqual(
            receipt["adapter"]["seedExpanderId"],
            "placeholder-seed-expander/v0",
        )
        self.assertFalse(receipt["adapter"]["learnedMlpUsed"])
        self.assertEqual(
            receipt["adapter"]["learnedMlpFeatureSchema"],
            "witt.image.adapter.features/sha256-canonical-json-v0",
        )
        self.assertEqual(
            receipt["adapter"]["semanticAlignment"],
            "not_measured_seed_expander_hash_baseline",
        )
        self.assertTrue(receipt["aggregate"]["allCasesChanged"])

    def test_each_case_has_token_and_png_delta_receipts(self) -> None:
        receipt = json.loads(FIXTURE.read_text(encoding="utf-8"))
        cases = receipt["cases"]

        self.assertGreaterEqual(len(cases), 5)
        for case in cases:
            self.assertGreater(case["tokenHammingRate"], 0)
            self.assertGreater(case["meanAbsoluteTokenDelta"], 0)
            self.assertRegex(case["baseLatentSha256"], r"^[0-9a-f]{64}$")
            self.assertRegex(case["variantLatentSha256"], r"^[0-9a-f]{64}$")
            self.assertRegex(case["basePngSha256"], r"^[0-9a-f]{64}$")
            self.assertRegex(case["variantPngSha256"], r"^[0-9a-f]{64}$")
            self.assertIn(case["verdict"], {"output_changed_hash_baseline"})


if __name__ == "__main__":
    unittest.main()
