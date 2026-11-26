# Compute-readiness roadmap — 2026-11-27

## Purpose and present decision

Prepare the smallest credible experiment before reserving a larger machine.
The current owner direction is **compute-unconfirmed**. The May 13
[research program](2026-05-13-wittgenstein-research-program.md) remains historical
research context; its quoted allocation, GPU-week estimates, batch sizes, and
quality targets are not current reservations, capacity measurements, or results.

This is a dated engineering execution assessment, not a new architecture or
release policy. ADR-0018's single Visual Seed Code image path, ADR-0020's license
boundary, and the existing M1B acceptance gates remain in force. A substantive
architecture change still follows the repository's decision lanes.

The near-term outcome is a reproducible **go / stop decision**, not a promise
that more compute will establish the thesis. A tokenizer round-trip, an
image-derived seed expander, and a text planner predicting useful seeds answer
three different questions. None substitutes for the next.

## What exists, and what does not

| Surface                                                            | Executable now                                                                                         | Remaining evidence or implementation                                                                                        |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| TypeScript harness, deterministic reviewer bench, manifests/replay | Yes; local CPU checks                                                                                  | Fresh Dependabot Linux PR CI passed; author/main execution remains unresolved; learned-image install needs approved weights |
| `python/image_adapter/`                                            | Narrow scene-spec → latent MLP / parity surface                                                        | Not the learned VSC seed expander; preserve the documented training-home boundary                                           |
| `research/training/tokenizer/`                                     | Native PyTorch loop, optional GAN, input checks, checkpoints, integrity/resume tools, final evaluation | Current target-host qualification, real-data pilot, held-out quality, release eligibility                                   |
| `research/training/adapter/`                                       | Documentation only                                                                                     | Dataset/cache builder, seed definition, trainer, export, inference parity, quality gates (#397)                             |
| `research/training/llm-head/`                                      | Documentation only                                                                                     | Teacher/data rights, representation, trainer, validation (#398)                                                             |
| Data / experiment tracking                                         | Snapshot/local JSONL receipts plus CPU image integrity and exact-duplicate audit                       | Licensed usable corpus, near-duplicate review, accessible DVC remote (#400); shared service (#399)                          |

The runtime seed expanders labeled placeholder-class are engineering baselines,
not learned models. Passing their routing tests is not completion of M1B.

## Validation ladder

These are proposed experiment gates for the next operator. They do not start
jobs or authorize spending. Commands are run from the repository root. Every
future executed experiment retains its resolved config, environment, logs,
source SHA, dataset identity, checkpoint/manifest pair and closeout evidence.
Use an explicit `--out-root artifacts/runs/<purpose>`; do not cite an unrecorded
notebook result as qualification.

### G0 — software and access, before requesting compute

1. Run normal lifecycle `pnpm install --frozen-lockfile`, typecheck, lint,
   publish/dependency boundaries, full build, `pnpm test:serial`, goldens and
   reviewer bench. The ONNX CUDA-download opt-out in `.npmrc` is an install
   choice, not proof of CUDA inference support.
2. Run the receipt/recovery unit suites and the CPU two-rank regression in
   `research.training.tokenizer.test_distributed_forward`. The regression uses
   a one-parameter test model with opposing rank-local objectives; equal final
   parameters are required, not just two successful exits. It covers generator
   and discriminator wiring without training a research model.
3. Obtain a **new** clean Linux qualification for the selected source revision.
   Fresh Dependabot PR runs 45889848405 and 45892137943 passed on 2026-11-27
   (Asia/Shanghai), including the rebased dependency combination and the 87-test
   CPU-torch/gloo suite; see the
   [maintainer evidence](2026-11-27-maintainer-readiness.md#validation-evidence-and-limits).
   The earlier author-dispatch HTTP 422 remains unresolved, and those PR runs
   do not establish a current-main push run or future dependency combinations.
   Follow #661 and proposed PR #711 for separately reviewed governance
   activation; dependency automerge remains disabled meanwhile.
4. Choose one question, an operator, a target host, a maximum wall time and a
   storage/compute cap. No available host or approved cap means no launch.

### G1 — data rights and identity, still without training

- Select a small authorized image corpus first. Do not infer image rights from
  a dataset index license, an MIT architecture license, or a `permissive` flag.
  Record permitted use, redistribution/checkpoint restrictions, source, and
  retrieval date. Keep checkpoint posture `research-only` until cleared.
- Separate train, validation, and final evaluation before model selection.
  Record content hashes; exclude cross-split duplicates and disclose residual
  near-duplicate risk. Keep the held-out split unchanged across comparisons.
- Run the [local integrity audit](2026-11-27-dataset-audit.md) on a curated
  pilot first; it records file/RGB hashes, dimensions, errors and exact duplicate
  groups. Its in-memory index is not a distributed large-corpus service.
  Training can still replace corrupt samples with a corruption tally; validation
  now fails rather than replacing them. A nonzero or unknown training corruption
  count requires investigation. Missing or failed evaluation metrics propagate
  explicit degradation; see the [evaluation correction](2026-11-27-evaluation-integrity.md).
- Pin the actual DVC revision and snapshot receipt per
  [data setup](../training/data.md). A populated environment variable is not
  proof that the directory matches that snapshot. Verify fetched content,
  credential availability, disk capacity and an independent restore.
- Define cached-token identity using **source content hash + preprocessing +
  tokenizer checkpoint hash + codebook/config + split**. Never reuse token
  caches across tokenizer versions merely because grid dimensions match.

**Stop:** absent rights, unknown data identity, split leakage, decode failures,
or an inaccessible remote. Existing synthetic sweep receipts prove the
receipt schema only; they do not satisfy G1.

### G2 — target environment and one-device plumbing

Follow [training setup](../contributing/training-setup.md), starting with a
separate environment. `requirements.txt` is an open compatibility floor and the
Dockerfile is an unqualified template. Capture the actual resolved dependencies,
container digest if used, Python/PyTorch/CUDA/driver versions, device model and
memory, and `pip check`. Pre-stage LPIPS/metric assets with their identifiers
if required; do not discover an unexpected download halfway through a run.

1. Explicit synthetic smoke: qualify startup, finite loss, checkpoint and
   receipt emission. It is not a dataset or quality experiment.
2. Small licensed ImageFolder plumbing: use the documented 20-step, batch-2,
   64-pixel, `--no-lpips` example. It is explicitly L2-only and the default
   optimizer warmup is longer than this check. Do not interpret its loss
   trajectory as a convergence or full-recipe result.
3. Inspect checkpoint integrity and `acceptance.json`, experiment JSONL,
   dataset-corruption counts and final manifest. Confirm the config records
   what actually ran, not the recipe someone intended to run.
4. For a quality pilot, return to the intended resolution and full declared
   objective. Default GAN is **off**; `--gan` with `--gan-on-step` later than the
   run still does no adversarial training. Record the active losses explicitly.

**Stop:** OOM, non-finite objective/gradients, missing receipts, unexpected
fallback, corrupt data, or failed objective prerequisites. Diagnose and make a
new explicit config; do not silently reduce resolution, disable a loss or swap
data. A deliberately changed objective is a new experiment.

### G3 — capacity, distribution and restart before a long run

- Measure warm-start step time and peak device memory on the selected host at
  the intended resolution/objective, starting at a small batch. Include data
  loading, evaluation and checkpoint I/O. No batch-128/eight-card safety claim
  is inherited from the historical plan.
- Estimate cost from **measured seconds/step × planned steps × device count**,
  plus measured setup/eval/I/O margin. Record dollars only against the actual
  allocation price. A pilot extrapolation is an estimate, not a guarantee.
- Run two ranks first. Record rank count, backend, aggregate batch, sampler
  behavior, rank agreement and throughput. The CPU regression fixes a real
  bypass of the DDP reducer; CUDA/NCCL and larger-node behavior still need
  target-host qualification. DDP samples can be padded when counts are uneven.
- Force a controlled interruption after a committed periodic checkpoint. The
  checkpoint and its sibling manifest form a pair. Verify SHA-256 and bytes,
  resume with the **same original `max_steps` and objective/data/config**, and
  check advancement, optimizer restoration and emitted receipts. Also test
  rejection of corrupt bytes and incompatible config without training.
- Current resume captures rank-tagged rank-0 RNG; it does **not** capture every
  rank's RNG and the complete sampler/loader cursor. It is resumable integrity,
  not bit-identical distributed continuation. If exact replay is required by
  the proposed experiment, implement and test that state first.
- `eval_every`, `keep_last_n_checkpoints`, and `aim_repo` are currently surfaced
  as unused. Evaluation runs at closeout; checkpoint rotation and a shared Aim
  service are not implemented. Reserve disk for all periodic checkpoints and
  their optimizer state. Do not rely on those knobs to protect a long run.

**Stop:** rank divergence, a deadlock, integrity/config rejection, storage
exhaustion risk, or a budget estimate exceeding the approved cap. Do not scale
an unreliable two-rank run to a full node.

### G4 — the first scientific result, before scaling the research program

Freeze a small evaluation protocol before tuning. Use paired held-out examples,
fixed preprocessing, a declared seed set and matched compute/sample budgets.
Report missing metric dependencies as missing, never a quality pass. A tiny
pilot FID/rFID estimate is not comparable with a full reference benchmark.

| Question                                       | Minimal comparison                                                                                                   | What would falsify the next spend                                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Can the tokenizer represent the data?          | Round-trip reconstructions, PSNR/SSIM/LPIPS where available, code usage and held-out rFID with a matched reference   | Collapse, poor held-out reconstruction, or no reason for a new tokenizer over a rights-cleared frozen baseline |
| Does short VSC preserve useful information?    | Fixed-position categorical-token baseline vs proposed learned expander, at equal seed length and decoder             | No held-out benefit, overfit to train examples, or improvement explained by extra side information             |
| Can the text-only planner produce those seeds? | Text-derived seeds vs image-derived oracle seeds; shuffled/blank seeds; semantic support on/off at equal seed budget | Only oracle seeds work, outputs ignore seeds, or semantic support carries all improvement                      |
| Does the entire path help users?               | End-to-end task/prompt suite, blinded paired assessment, invalid-code/repair rate, latency and manifest completeness | Worse controllability, no reliable improvement, excessive repairs or unacceptable cost                         |

Do **not** average integer VQ token IDs to produce a visual seed. IDs are
categorical labels; their numeric mean is not a visual interpolation. Selecting
existing tokens is a simple reproducible baseline. Pooling embeddings and
re-quantizing, or learning compression, are separate versioned hypotheses.
Changing seed format or the runtime contract still requires RFC/ADR routing.

D=32 vs D=8, seed length, expander size and semantic support should be isolated
ablations; changing all simultaneously prevents attribution. Write the primary
endpoint, reference baseline and minimum useful effect _before_ examining the
held-out result. A repeated-seed comparison and uncertainty estimate come before
any broad quality claim. The historical rFID ≤ 2.0 target is not a substitute
for a matched protocol.

### G5 — larger allocation and integration, conditional on G0–G4

Only after a useful pilot: select an explicit resource cap, implement the missing
learned subprogram through #397/#398 as appropriate, requalify its export against
the existing image adapter/decoder ABI, and run existing downstream gates.
Training a new tokenizer is not automatically the first or cheapest route to a
seed-expansion proof. Compare that expense with a rights-cleared frozen target;
#402 still owns canonical weights selection. No alternative image path is
introduced by that comparison.

Before weights distribution: actual dataset/teacher/checkpoint rights review,
content hashes, training/eval receipts, inference parity, documented install and
failure paths, and downstream decoder-family approval are required. Completing
this document, a smoke, or a synthetic receipt sweep does not meet those gates.

## Work queue and dependency order

1. **Now / no allocation:** maintain installation and regression checks; resolve
   author/main Actions execution and gate activation (#661); prepare real
   data/remote evidence (#400) and select candidate weights (#402). Runtime
   version identity (#707) is resolved in PR #716. The technical data audit
   (PR #719) does not close the rights/restore gate. Shared tracking (#399) helps
   collaboration, but local JSONL is already usable for a bounded pilot.
2. **First qualified allocation:** G2–G3 tokenizer plumbing / capacity / restart;
   operator signs off the exact config and cost estimate in #396. Capture the
   limitations above in the run closeout.
3. **First useful research allocation:** choose one G4 question and implement
   the missing code for it. Do not present #397/#398 as launch-ready entrypoints.
   Keep M1B umbrella #70 open until its actual gates pass.
4. **Later:** larger ablations and quality evaluation (#394/#452), then the
   deferred latency/seed/sensor measurements (#392/#393/#263). These are not
   preconditions for finishing today's software maintenance.

The [small-pilot rigor proposal](https://github.com/p-to-q/wittgenstein/pull/720)
is awaiting independent review. It identifies unresolved categorical-target,
compact/full-grid alignment and gradient-path definitions in #397/#398; it is
not an approved new representation, trainer, experiment or allocation. Current
software evidence is in the [robustness closeout](2026-11-27-robustness-closeout.md).

For each gate, append evidence and a **pass / stop / not-run** result to the
owning issue. Keep failures and the exact changed config; do not erase a failed
run by relabeling a later, different run as the same qualification.

## Primary references and interpretation boundary

- [PyTorch DistributedDataParallel](https://docs.pytorch.org/docs/stable/generated/torch.nn.parallel.DistributedDataParallel.html): wrapper forward and synchronization behavior; basis for the reducer regression.
- [PyTorch reproducibility notes](https://docs.pytorch.org/docs/stable/notes/randomness.html): reproducibility limitations and data-loader worker/generator handling; not a guarantee of cross-platform bit parity.
- [LlamaGen source and model documentation](https://github.com/FoundationVision/LlamaGen): architecture lineage / external reference; not evidence that this implementation or a different recipe reproduces its scores.
- [TiTok project](https://yucornetto.github.io/projects/titok.html): learned compact tokenization is research precedent, not proof that subsampled categorical tokens have the same properties.
- [Clean-FID](https://github.com/GaParmar/clean-fid): preprocessing and metric implementation must be controlled for score comparison.

This roadmap makes no new result claim from those papers. The next decision is
which small experiment earns a larger allocation, using this repository's own
measured evidence.
