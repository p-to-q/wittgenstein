#!/usr/bin/env python3
"""
Phase 0a: LLM emission entropy test.

Prompts a frontier LLM with the VSC preamble for N image prompts × M runs at
temperature=0.3. Measures per-position token entropy and inter-run Hamming
distance to assess whether the LLM emits structured or random seed codes.

Usage:
    python phase0a_emission_entropy.py [--provider anthropic|openai] [--runs 10] [--prompts 10]

Requires:
    pip install anthropic  # or openai

@see docs/research/2026-05-22-ir-reliability-validation.md §Phase 0a
@see docs/research/2026-05-22-seed-code-stability-analysis.md §Empirical validation
@see https://github.com/p-to-q/wittgenstein/issues/451
"""

import argparse
import json
import math
import os
import sys
from collections import Counter
from typing import Any

VSC_PREAMBLE = """You are the image planner for Wittgenstein.

Return valid JSON only. Do not return markdown fences. Do not return prose explanations.

Your job is to emit a Visual Seed Code contract for the sole neural image pipeline.

Before emitting seedCode.tokens, populate semantic.reasoning with your visual plan:
  - spatialPlan: describe the spatial layout (horizon, subject placement, regions).
  - colorPlan: describe the dominant color scheme and transitions.
  - depthPlan: describe foreground / midground / background allocation.
  - tokenStrategy: describe which seed tokens encode which visual regions.

Emit exactly this JSON shape:
{
  "schemaVersion": "witt.image.spec/v0.1",
  "mode": "one-shot-vsc",
  "semantic": {
    "intent": "<user prompt>",
    "subject": "<main subject>",
    "reasoning": {
      "spatialPlan": "<spatial layout description>",
      "colorPlan": "<color scheme description>",
      "depthPlan": "<depth allocation>",
      "tokenStrategy": "<token allocation plan>"
    }
  },
  "seedCode": {
    "schemaVersion": "witt.image.seed/v0.1",
    "family": "vqvae",
    "mode": "prefix",
    "tokens": [<32 integers in range 0-4095>]
  }
}

Use exactly 32 tokens in range 0-4095. Each token represents a compressed visual feature.
Early tokens should encode gross layout; later tokens should encode fine details."""

IMAGE_PROMPTS = [
    "A stormy ocean at midnight with lightning",
    "A cozy cabin in a snowy forest",
    "A bustling Tokyo street at night with neon signs",
    "A single red rose on a white marble table",
    "An astronaut floating above Earth at sunset",
    "A medieval castle on a cliff overlooking a misty valley",
    "A golden retriever running through autumn leaves",
    "A minimalist Bauhaus-style poster in red, yellow, and blue",
    "An underwater coral reef with tropical fish",
    "A desert sand dune at dawn with long shadows",
]


def call_anthropic(prompt: str, temperature: float = 0.3) -> str:
    """Call Anthropic API."""
    try:
        import anthropic
    except ImportError:
        print("pip install anthropic", file=sys.stderr)
        sys.exit(1)

    client = anthropic.Anthropic()
    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2048,
        temperature=temperature,
        system=VSC_PREAMBLE,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


def call_openai(prompt: str, temperature: float = 0.3) -> str:
    """Call OpenAI API."""
    try:
        from openai import OpenAI
    except ImportError:
        print("pip install openai", file=sys.stderr)
        sys.exit(1)

    client = OpenAI()
    response = client.chat.completions.create(
        model="gpt-4o",
        temperature=temperature,
        messages=[
            {"role": "system", "content": VSC_PREAMBLE},
            {"role": "user", "content": prompt},
        ],
    )
    return response.choices[0].message.content or ""


def extract_tokens(response: str) -> list[int] | None:
    """Extract seedCode.tokens from LLM response JSON."""
    try:
        # Try to find JSON in the response
        text = response.strip()
        if text.startswith("```"):
            # Strip markdown fences
            lines = text.split("\n")
            text = "\n".join(lines[1:-1])
        data = json.loads(text)
        tokens = data.get("seedCode", {}).get("tokens", [])
        if isinstance(tokens, list) and len(tokens) > 0:
            return [int(t) for t in tokens]
    except (json.JSONDecodeError, KeyError, ValueError, TypeError):
        pass
    return None


def extract_reasoning(response: str) -> dict[str, str] | None:
    """Extract semantic.reasoning from LLM response JSON."""
    try:
        text = response.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1])
        data = json.loads(text)
        return data.get("semantic", {}).get("reasoning")
    except (json.JSONDecodeError, KeyError, ValueError, TypeError):
        return None


def entropy(values: list[int]) -> float:
    """Shannon entropy of a discrete distribution."""
    counts = Counter(values)
    total = len(values)
    if total == 0:
        return 0.0
    return -sum(
        (c / total) * math.log2(c / total) for c in counts.values() if c > 0
    )


def hamming_distance(a: list[int], b: list[int]) -> int:
    """Count positions where a[i] != b[i]."""
    return sum(1 for x, y in zip(a, b) if x != y)


def run_experiment(
    provider: str, num_prompts: int, num_runs: int, temperature: float
) -> dict[str, Any]:
    """Run the full experiment and return results."""
    call_fn = call_anthropic if provider == "anthropic" else call_openai
    prompts = IMAGE_PROMPTS[:num_prompts]

    results: dict[str, Any] = {
        "provider": provider,
        "temperature": temperature,
        "num_prompts": num_prompts,
        "num_runs": num_runs,
        "per_prompt": [],
    }

    for i, prompt in enumerate(prompts):
        print(f"\n[{i+1}/{len(prompts)}] Prompt: {prompt}")
        all_tokens: list[list[int]] = []
        reasoning_present = 0
        parse_failures = 0

        for run in range(num_runs):
            print(f"  Run {run+1}/{num_runs}...", end=" ", flush=True)
            try:
                response = call_fn(prompt, temperature=temperature)
                tokens = extract_tokens(response)
                reasoning = extract_reasoning(response)

                if tokens is not None:
                    all_tokens.append(tokens)
                    print(f"OK ({len(tokens)} tokens)", end="")
                else:
                    parse_failures += 1
                    print("PARSE_FAIL", end="")

                if reasoning is not None:
                    reasoning_present += 1
                    print(f" +reasoning", end="")
                print()

            except Exception as e:
                parse_failures += 1
                print(f"ERROR: {e}")

        if len(all_tokens) < 2:
            print(f"  WARNING: Only {len(all_tokens)} successful runs, skipping analysis")
            results["per_prompt"].append({
                "prompt": prompt,
                "successful_runs": len(all_tokens),
                "parse_failures": parse_failures,
                "reasoning_rate": reasoning_present / num_runs if num_runs > 0 else 0,
                "analysis": "insufficient_data",
            })
            continue

        # Normalize to same length (pad shorter with -1)
        max_len = max(len(t) for t in all_tokens)
        padded = [t + [-1] * (max_len - len(t)) for t in all_tokens]

        # Per-position entropy
        per_position_entropy = []
        for pos in range(max_len):
            values_at_pos = [t[pos] for t in padded if t[pos] != -1]
            per_position_entropy.append(entropy(values_at_pos))

        # Pairwise Hamming distances
        hamming_distances = []
        for j in range(len(all_tokens)):
            for k in range(j + 1, len(all_tokens)):
                min_len = min(len(all_tokens[j]), len(all_tokens[k]))
                hd = hamming_distance(all_tokens[j][:min_len], all_tokens[k][:min_len])
                hamming_distances.append(hd / min_len if min_len > 0 else 0)

        # Token range statistics
        all_flat = [t for seq in all_tokens for t in seq]
        token_range = (min(all_flat), max(all_flat)) if all_flat else (0, 0)

        prompt_result = {
            "prompt": prompt,
            "successful_runs": len(all_tokens),
            "parse_failures": parse_failures,
            "reasoning_rate": reasoning_present / num_runs,
            "token_lengths": [len(t) for t in all_tokens],
            "token_range": token_range,
            "per_position_entropy": {
                "mean": sum(per_position_entropy) / len(per_position_entropy),
                "max": max(per_position_entropy),
                "min": min(per_position_entropy),
                "first_8_mean": sum(per_position_entropy[:8]) / min(8, len(per_position_entropy)),
                "last_8_mean": sum(per_position_entropy[-8:]) / min(8, len(per_position_entropy)),
            },
            "hamming_distance": {
                "mean": sum(hamming_distances) / len(hamming_distances) if hamming_distances else 0,
                "max": max(hamming_distances) if hamming_distances else 0,
                "min": min(hamming_distances) if hamming_distances else 0,
            },
        }

        # Interpretation
        mean_entropy = prompt_result["per_position_entropy"]["mean"]
        if mean_entropy < 1.0:
            prompt_result["interpretation"] = "LOW_ENTROPY — LLM has strong prior (Scenario B1/B2)"
        elif mean_entropy < 3.0:
            prompt_result["interpretation"] = "MODERATE_ENTROPY — some structure, some randomness"
        else:
            prompt_result["interpretation"] = "HIGH_ENTROPY — LLM may be guessing (Scenario B3)"

        first_8 = prompt_result["per_position_entropy"]["first_8_mean"]
        last_8 = prompt_result["per_position_entropy"]["last_8_mean"]
        if first_8 < last_8 * 0.7:
            prompt_result["ordering_signal"] = "POSITIVE — early tokens more stable than late tokens"
        elif first_8 > last_8 * 1.3:
            prompt_result["ordering_signal"] = "NEGATIVE — early tokens less stable (concerning)"
        else:
            prompt_result["ordering_signal"] = "NEUTRAL — no clear importance ordering"

        results["per_prompt"].append(prompt_result)

        print(f"  Entropy: mean={mean_entropy:.2f}, first_8={first_8:.2f}, last_8={last_8:.2f}")
        print(f"  Hamming: mean={prompt_result['hamming_distance']['mean']:.2%}")
        print(f"  Interpretation: {prompt_result['interpretation']}")
        print(f"  Ordering: {prompt_result['ordering_signal']}")

    # Aggregate
    all_entropies = [
        p["per_position_entropy"]["mean"]
        for p in results["per_prompt"]
        if isinstance(p.get("per_position_entropy"), dict)
    ]
    all_hamming = [
        p["hamming_distance"]["mean"]
        for p in results["per_prompt"]
        if isinstance(p.get("hamming_distance"), dict)
    ]
    results["aggregate"] = {
        "mean_entropy": sum(all_entropies) / len(all_entropies) if all_entropies else None,
        "mean_hamming": sum(all_hamming) / len(all_hamming) if all_hamming else None,
        "parse_success_rate": sum(
            p["successful_runs"] for p in results["per_prompt"]
        ) / (num_prompts * num_runs) if num_prompts * num_runs > 0 else 0,
        "reasoning_rate": sum(
            p.get("reasoning_rate", 0) for p in results["per_prompt"]
        ) / num_prompts if num_prompts > 0 else 0,
    }

    return results


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Phase 0a: LLM emission entropy test for Visual Seed Code"
    )
    parser.add_argument(
        "--provider",
        choices=["anthropic", "openai"],
        default="anthropic",
        help="LLM provider (default: anthropic)",
    )
    parser.add_argument("--runs", type=int, default=5, help="Runs per prompt (default: 5)")
    parser.add_argument("--prompts", type=int, default=5, help="Number of prompts (default: 5)")
    parser.add_argument("--temperature", type=float, default=0.3, help="Sampling temperature")
    parser.add_argument("--output", type=str, default=None, help="Output JSON path")
    args = parser.parse_args()

    results = run_experiment(args.provider, args.prompts, args.runs, args.temperature)

    # Print summary
    print("\n" + "=" * 60)
    print("AGGREGATE RESULTS")
    print("=" * 60)
    agg = results["aggregate"]
    print(f"  Parse success rate: {agg['parse_success_rate']:.0%}")
    print(f"  Reasoning compliance rate: {agg['reasoning_rate']:.0%}")
    if agg["mean_entropy"] is not None:
        print(f"  Mean per-position entropy: {agg['mean_entropy']:.2f} bits")
        print(f"  Mean inter-run Hamming distance: {agg['mean_hamming']:.2%}")
    print()

    if agg["mean_entropy"] is not None:
        if agg["mean_entropy"] < 1.0:
            print("VERDICT: Scenario B1/B2 — LLM has strong prior over seed code tokens.")
            print("  The VSC thesis is supported at the emission level.")
        elif agg["mean_entropy"] < 3.0:
            print("VERDICT: Mixed signal — some structure, needs further investigation.")
            print("  Adapter training may compensate for partial randomness.")
        else:
            print("VERDICT: Scenario B3 — LLM appears to be guessing token values.")
            print("  Consider: semantic-only IR + strong adapter, or paired training data.")

    # Save results
    output_path = args.output or f"phase0a_results_{args.provider}.json"
    with open(output_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to {output_path}")


if __name__ == "__main__":
    main()
