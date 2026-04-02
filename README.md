# OpenTranslate

PDF resume translation app built with Bun, Next.js, shadcn/ui, `unpdf`, and `pdf-lib`.

## Local development

From the repo root:

```bash
bun install
bun dev
```

The root `bun dev` command runs the web app through Portless so it does not take over `localhost:3000`.

If Portless has not started its proxy on your machine yet, start it once in another terminal:

```bash
cd apps/web
./node_modules/.bin/portless proxy start -p 1355 --https
```

Then `bun dev` will serve the app at a stable local URL like:

```text
https://open-translate.localhost:1355
```

## Manual PDF regression loop

Use the real PDF pipeline directly against a local resume file:

```bash
bun run --cwd apps/web manual:regression --input ../../resume-test.pdf --source en --target fr
```

Artifacts are written to `testing/manual-regression/` and ignored by git. Each run emits:

- the translated PDF
- a `summary.json` file with page count, block count, and warnings

This gives a repeatable way to compare before/after output while iterating on PDF fidelity.
