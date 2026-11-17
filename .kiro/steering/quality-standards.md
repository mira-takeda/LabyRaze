---
inclusion: fileMatch
fileMatchPattern:
  - "tests/**"
  - "tools/**"
---

# Quality Standards

## Definition of done

A task is done only when all of these pass:

- `npm run build` (`tsc --noEmit && vite build`)
- `npm run lint`
- `npm run lint:determinism`
- `npm test` and the task's own `Verify:` command
- `npm run check:soundtrack` when audio or assets are touched

## Rules

- No mandatory test is skipped, missing, or unmatched. A `Verify:` that matches zero test files is not a pass.
- Fix failures at the root cause and rerun. Do not start the next task with a failing check.
- Do not loosen a test, band or budget to get green. Change values only with recorded evidence (see `open-decisions.md`).
- Shared files (`types.ts`, `events.ts`, `config.ts`, `sim.ts`, `rules.ts`, `renderer.ts`, `main.ts`): make minimal additive edits and rerun `npx tsc --noEmit`.
- `src/core/**` stays deterministic and free of DOM, render, audio, input and shell imports.
- `public/audio/Pixel Pulse.wav` is never modified; scripts and tests are read-only there.
- Remove temporary files created during verification.
