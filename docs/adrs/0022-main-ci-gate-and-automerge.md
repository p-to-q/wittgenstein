# 0022 Required main CI gate and dependency automerge activation

## Status

**Proposed — not ratified or activated.** Governance lane; tracks #661 and the
merge-boundary part of #267. Requires an independent formal GitHub Review under
[ADR-0013](0013-independent-ratification-for-doctrine-prs.md). The author of this
proposal is not its ratifier. No branch-protection settings are changed by this
PR.

## Context

The November 27 maintainer audit found main unprotected. The repository's
`allow_auto_merge` flag is false, but that does not prevent a workflow with
write permissions from merging dependency PRs through the API. That separate
Dependabot automerge workflow has been disabled as a reversible containment
measure; it must not be described as an active main-branch gate.

The CI definition now runs full verification for PRs and main pushes, including
Node/Python checks, the site build, a CPU-torch distributed regression, and
static/dependency checks. An always-evaluated aggregate job is named `CI gate`.
This is implemented workflow logic, not an already required branch status.

The author's manual Actions dispatch failed with HTTP 422, "Actions has been
disabled for this user." The repository API's enabled flag is insufficient
evidence that this path works, and the precise service/account cause is unknown.
Later on November 27 (Asia/Shanghai), fresh Dependabot-triggered Linux PR runs
[45889848405](https://github.com/p-to-q/wittgenstein/actions/runs/45889848405) and
[45892137943](https://github.com/p-to-q/wittgenstein/actions/runs/45892137943)
passed full verification, CPU-torch/gloo regressions and the aggregate gate;
the latter qualified #712 after rebasing onto merged #713. Run/head/base
identities, every job and full logs were inspected. This establishes working
Dependabot PR execution, not restored author dispatch or a current-main push
run. Vercel and skipped bot reviews are not substitutes. An older PR's green
check does not qualify a rebased or new commit.

## Proposed decision

### Required result on main

Require PRs and the exact aggregate `CI gate` check on the latest mergeable
head, with an up-to-date base. The aggregate succeeds only if all current
verification jobs succeed; skipped, cancelled, failed, or missing prerequisites
must not be interpreted as success. Protect main against force pushes and
branch deletion. Record the actual rule/ruleset and check identity after
activation, not merely the proposed display name.

This proposal does not add a blanket one-review requirement to every
engineering PR. It preserves ADR-0013's independent formal review requirement
for doctrine-bearing changes; settling any broader review/authority question
remains in #267. A status check is necessary evidence, not independent doctrine
ratification.

### Dependency automerge

Keep `auto-merge-dependabot.yml` disabled until the activation sequence below
has completed. If independently approved for re-enablement, the automation must
wait for the required checks on the current head and respect the same main
rule; it must not merge simply because it recognized the author or dependency
name. A different dependency policy requires its own reviewed governance
change rather than a hidden workflow bypass.

### Actions outage

A missing CI result is **unqualified**, not green. Local validation may be
published with host, revision, command and result, but does not replace Linux
qualification. Do not re-enable automated merging during an Actions outage.
This proposal grants no new emergency bypass or self-ratification authority.
Any separately authorized exceptional action must retain the missing-evidence
limitation; it cannot manufacture a successful check.

## Activation sequence after independent ratification

1. Restore the missing author/main Actions execution through the account/service
   owner. Preserve the observed dispatch error and successful Dependabot PR
   evidence separately; record the resolution without guessing its cause.
2. Dispatch the current workflow on the selected main revision. Require a fresh
   successful Linux run, including install lifecycle, full build/site, JS and
   Python suites, CPU-torch two-rank regression, goldens/reviewer bench, and
   static/dependency checks where applicable. A PR run must also prove the
   PR-specific dependency-review branch.
3. Verify the aggregate check's actual identity/context on that revision and
   configure the selected main rule to require it with current-base checking,
   PR routing, and force-push/deletion protection. Read the rule back through
   GitHub and record the active configuration.
4. Confirm a failed/skipped/missing prerequisite cannot produce a successful
   aggregate or an automated merge. Use an isolated disposable PR without
   merging a failing change; retain the evidence and close the probe.
5. Only then decide whether to enable dependency automerge. Record the approved
   automation behavior and a current-head successful-check case before enabling
   the workflow. Disabling it remains the rollback if execution or required
   checks disappear.
6. Close #661 only when the gate is actually enforced and the activation
   evidence is linked. #267 closes only when its wider authority/process
   questions have independently been resolved, not as a side effect of this ADR.

## Consequences and alternatives

The initial cost is an external Actions repair and an independent review. The
benefit is that a passing check means the relevant workflow actually ran, and
automation cannot outrun its result. Full verification also avoids a docs-only
skip leaving the required check absent.

Rejected as activation evidence: a repository-level `enabled` flag alone,
local-only success labeled Linux CI, an old dependency branch's check after
rebasing, Vercel deployment authorization, or a PR comment used instead of the
formal review required by ADR-0013.

No operating-document inline doctrine should be added as though this were
accepted. After ratification and activation, add only concise pointers to this
ADR where the existing operating documents need them.
