# M2 Route Deprecation Inventory

**Status:** prep artifact for M2 preflight  
**Date:** 2026-04-28  
**Scope:** request-side `AudioRequest.route`, CLI `--route`, and route-first docs/examples  
**Related issues:** #76, #79

This note completes the bounded preflight inventory for the M2 audio port. It does
not start the port itself. Its job is to answer one narrow question before
`packages/codec-audio` changes:

> Where does request-side audio routing still exist today, and which of those surfaces
> should be kept, migrated, or removed once routing becomes codec-owned?

## Caller table

| Path                                                     | Kind                    | Keep / migrate / remove | Notes                                                                                                                                                              |
| -------------------------------------------------------- | ----------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/cli/src/commands/audio.ts`                     | primary CLI surface     | migrate                 | Public `wittgenstein audio` still advertises `--route`. Keep the command; treat `--route` as the one-minor-version compatibility shim that enters soft-warn at M2. |
| `packages/cli/src/commands/tts.ts`                       | convenience CLI surface | migrate                 | Keep `wittgenstein tts` as the speech-specialized entrypoint, but stop relying on request-side `route: "speech"` once codec-owned routing lands.                   |
| `packages/codec-audio/test/codec.test.ts`                | test caller             | migrate                 | Update to whatever the post-M2 request shape becomes; this is not a public compatibility surface.                                                                  |
| `packages/cli/README.md`                                 | CLI doc example         | migrate                 | Current `audio --route music` example should become intent-first or be explicitly marked transitional once M2 lands.                                               |
| `README.md`                                              | repo-level example      | migrate                 | Same as the CLI README: keep audio launch examples, but do not keep route-first examples as the canonical public surface after M2.                                 |
| `docs/codecs/audio.md`                                   | canonical codec doc     | migrate                 | The doc can keep `--route` as a transitional compatibility note, but the examples should stop presenting it as the default interface.                              |
| `docs/modality-launch-surface.md`                        | launch-surface table    | migrate                 | Audio row currently bakes in `--route music`; update after M2 to show intent-first invocation.                                                                     |
| `docs/technical-details-script.md`                       | script / narration doc  | migrate                 | Historical script can retain historical wording if clearly marked; otherwise migrate the live command example.                                                     |
| `docs/quickstart.md`                                     | demo-surface quickstart | migrate                 | Keep as a demo-surface doc, but update examples so `--route` is not presented as the recommended long-term surface.                                                |
| `docs/research/briefs/D_cli_and_sdk_conventions.md`      | research note           | keep                    | This is analysis of the current CLI surface, not a shipping interface contract. It should stay as a receipt.                                                       |
| `docs/research/briefs/J_audio_engineering_and_routes.md` | research note           | keep                    | This brief intentionally discusses `--route` deprecation as a research/design decision. Keep as-is.                                                                |
| `docs/exec-plans/active/codec-v2-port.md`                | exec plan               | keep                    | Keep the deprecation target here; it is the right place to record that the caller-visible field exists today and deprecates at M2.                                 |
| `docs/agent-guides/audio-port.md`                        | implementation guide    | keep                    | Keep the deprecation work item and migration note; the guide should describe the transition, not erase it.                                                         |

## Blockers

No blockers were found that should prevent opening the M2 implementation PR after the
decoder-family ratification closes.

The remaining route-first surfaces are expected migration surfaces, not surprises:

- one public compatibility flag (`wittgenstein audio --route ...`);
- one convenience command whose internal request shape still pins `route: "speech"`;
- a small set of docs/examples that should migrate alongside the implementation PR.

That means `#76` can close with this inventory. The actual caller migration remains part
of the M2 implementation train, not a separate doctrine question.

## Migration snippets

### 1. Public CLI note for `wittgenstein audio`

When M2 lands, the command help and docs should describe `--route` as compatibility-only
rather than as the primary interface:

```text
--route <route>  Deprecated compatibility hint; audio routing now lives inside AudioCodec.route()
```

### 2. `wittgenstein tts` posture

Keep the dedicated speech entrypoint, but describe it as a convenience surface rather
than as proof that request-side routing remains canonical:

```text
wittgenstein tts "launch line" --ambient rain --out out.wav
```

Its internal request construction can change in the M2 PR without changing the command
itself.

### 3. Intent-first audio example

After M2 lands, the canonical audio example should stop advertising `--route` unless the
example is explicitly about transitional compatibility:

```text
wittgenstein audio "soft launch music with a slow synthetic pulse" --out out.wav
```

If a route-first example remains in docs, it should be marked as transitional:

```text
wittgenstein audio "soft launch music" --route music --out out.wav
# compatibility-only during the one-minor-version deprecation window
```

## Done when

This prep artifact has done its job when the M2 implementation PR can point to one place
for:

- the full caller inventory,
- the compatibility-vs-migration split,
- the fact that no hidden blockers remain before codec work starts.
