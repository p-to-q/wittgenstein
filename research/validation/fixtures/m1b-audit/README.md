# M1B audit fixtures

These JSON files are contract fixtures for local review and self-checks. They
are not empirical decoder results.

| File                               | Meaning                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| `gate-c-pass.fixture.json`         | Minimal Gate C metric shape that satisfies the default structural-parity pass criteria |
| `gate-d-onnx-export.fixture.json`  | Minimal successful ONNX export receipt shape                                           |
| `gate-d-fail.fixture.json`         | Gate D metric shape with complete fields but failing latency / shape                   |
| `vqgan-gates-blocked.fixture.json` | Final receipt shape showing Gate C passed and Gate D blocked                           |

Run:

```bash
pnpm m1b:audit-artifact-check -- research/validation/fixtures/m1b-audit
```

The validator accepts fixture aliases in this directory and standard artifact
filenames under `artifacts/m1b-audit/`.
