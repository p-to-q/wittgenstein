# 0002 TypeScript pnpm Monorepo

## Status

Accepted. Amended by ADR-0021 (2026-10-17): the Node 20+ runtime baseline is
superseded by Node 22.22+; the TypeScript + pnpm workspace decision stands.

## Decision

Use TypeScript on Node 20+ with pnpm workspaces for the entire repo.

## Consequence

Shared contracts, codec packages, CLI, and site live in one workspace with clear package boundaries.
