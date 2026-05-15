# `@wittgenstein/cli`

`@wittgenstein/cli` is the command-line entrypoint for Wittgenstein's multimodal harness.

It exposes a single binary:

```bash
wittgenstein
```

## Install

```bash
npm install -g @wittgenstein/cli
```

Or run it without global install:

```bash
npx @wittgenstein/cli doctor
```

## Commands

```bash
wittgenstein image  "editorial product shot" --out out.png
wittgenstein tts    "launch voiceover" --ambient rain --out out.wav
wittgenstein audio  "launch audio artifact" --out out.wav
wittgenstein sensor "stable ECG trace" --out out.json
wittgenstein video  "architecture teaser" --out out.mp4
wittgenstein doctor
wittgenstein install image --dry-run
```

## Smoke Check

```bash
pnpm --filter @wittgenstein/cli run smoke
```

## Notes

- Runs are traceable under `artifacts/runs/`.
- Relative `--out` paths resolve from the workspace root.
- `tts` is a convenience alias for the `audio` codec's `speech` route.
- `--route` remains available for one minor version as a deprecated compatibility hint.
- `install image --dry-run` plans the optional image decoder tier without downloading weights.
