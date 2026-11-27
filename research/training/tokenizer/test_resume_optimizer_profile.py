"""Torch-free checks for the AdamW profile boundary used before restoring state."""

from __future__ import annotations

import copy
import unittest

from .resume import ResumeOptimizerDrift, assert_optimizer_profile_compatible


def template():
    return {"param_groups": [{
        "params": [0], "lr": 0.00005, "betas": (0.9, 0.95),
        "eps": 1e-8, "weight_decay": 0.05, "amsgrad": False, "maximize": False,
    }]}


class OptimizerProfileTests(unittest.TestCase):
    def test_every_supported_math_field_must_match(self):
        for key, bad in (("lr", 0.1), ("betas", (0.8, 0.9)), ("eps", 1e-4), ("weight_decay", 0.1), ("amsgrad", True), ("maximize", True)):
            saved = template()
            saved["param_groups"][0][key] = bad
            with self.subTest(field=key), self.assertRaisesRegex(ResumeOptimizerDrift, key):
                assert_optimizer_profile_compatible(saved, template(), label="generator")

    def test_matching_schedule_legacy_flags_and_execution_choices_are_supported(self):
        saved = template()
        saved["param_groups"][0]["betas"] = [0.9, 0.95]
        for key in ("amsgrad", "maximize"):
            del saved["param_groups"][0][key]
        saved["param_groups"][0].update(foreach=True, fused=False)
        self.assertIsNone(assert_optimizer_profile_compatible(saved, template(), label="generator"))

    def test_group_shape_and_parameter_count_are_checked(self):
        for groups in (None, [], {}, [None], [{"params": []}], [template()["param_groups"][0]] * 2):
            with self.subTest(groups=groups), self.assertRaises(ResumeOptimizerDrift):
                assert_optimizer_profile_compatible({"param_groups": groups}, template(), label="generator")
        with self.assertRaises(ResumeOptimizerDrift):
            assert_optimizer_profile_compatible(None, template(), label="generator")

    def test_malformed_math_values_raise_the_typed_error(self):
        for key, values in {
            "lr": (None, float("nan"), float("inf"), True, [0.00005], 10 ** 1000),
            "betas": (None, 0.9, [0.9], [True, 0.95], [object(), 0.95]),
            "weight_decay": (None, "0.05", float("nan")),
            "eps": (None, {}, object()),
            "amsgrad": (0, None, []),
            "maximize": (0, None, []),
        }.items():
            for value in values:
                saved = copy.deepcopy(template())
                saved["param_groups"][0][key] = value
                with self.subTest(field=key, value=value), self.assertRaisesRegex(ResumeOptimizerDrift, key):
                    assert_optimizer_profile_compatible(saved, template(), label="generator")


if __name__ == "__main__":
    unittest.main()
