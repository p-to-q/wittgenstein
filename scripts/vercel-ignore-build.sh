#!/usr/bin/env bash
# Vercel "Ignored Build Step" command for the Wittgenstein monorepo.
#
# Wire this up in Vercel:
#   Project Settings → Git → Ignored Build Step → Custom command:
#       bash scripts/vercel-ignore-build.sh
#
# Contract (per Vercel):
#   exit 0 → SKIP the build (no deployment)
#   exit 1 → PROCEED with the build
#
# Rule we are enforcing:
#   The site only deploys when the changed files actually affect the site
#   build. Doc-only changes, codec/runtime changes, CI changes, etc. must
#   not trigger a Vercel deployment, because they cannot change the
#   shipped website bytes.
#
# A change touching ANY of these paths counts as site-affecting:
#   - apps/site/**                              (the site source itself)
#   - vercel.json                               (root Vercel config used
#                                                when project root is the
#                                                repo root)
#   - package.json, pnpm-lock.yaml,             (workspace deps that the
#     pnpm-workspace.yaml                        site build resolves)
#   - .github/workflows/site.yml                (site CI parity surface;
#                                                we want a Preview deploy
#                                                when site CI changes)
#   - scripts/vercel-ignore-build.sh            (this file — so behavior
#                                                changes are observable)
#
# Anything else → skip.

set -euo pipefail

# Vercel runs this command from the repo root for monorepo projects.
# When VERCEL_GIT_PREVIOUS_SHA is unset (first deploy / unknown base),
# we fall back to building so we never accidentally suppress a needed
# initial deploy.
PREV_SHA="${VERCEL_GIT_PREVIOUS_SHA:-}"
CURR_SHA="${VERCEL_GIT_COMMIT_SHA:-HEAD}"

if [ -z "$PREV_SHA" ]; then
  echo "vercel-ignore-build: no previous SHA — proceeding with build."
  exit 1
fi

# `git diff --name-only A B` lists files changed between two commits.
# If git plumbing is unavailable (it should not be on Vercel), proceed.
if ! command -v git >/dev/null 2>&1; then
  echo "vercel-ignore-build: git not available — proceeding with build."
  exit 1
fi

CHANGED="$(git diff --name-only "$PREV_SHA" "$CURR_SHA" 2>/dev/null || true)"

if [ -z "$CHANGED" ]; then
  echo "vercel-ignore-build: no diff vs $PREV_SHA — skipping."
  exit 0
fi

while IFS= read -r path; do
  case "$path" in
    apps/site/*) MATCH=1; break ;;
    vercel.json) MATCH=1; break ;;
    package.json) MATCH=1; break ;;
    pnpm-lock.yaml) MATCH=1; break ;;
    pnpm-workspace.yaml) MATCH=1; break ;;
    .github/workflows/site.yml) MATCH=1; break ;;
    scripts/vercel-ignore-build.sh) MATCH=1; break ;;
  esac
done <<< "$CHANGED"

if [ "${MATCH:-0}" = "1" ]; then
  echo "vercel-ignore-build: site-affecting change detected — proceeding with build."
  exit 1
fi

echo "vercel-ignore-build: no site-affecting changes — skipping."
echo "changed files were:"
printf '  %s\n' $CHANGED
exit 0
