---
inclusion: always
---

# Technical Constraints

## Stack

- TypeScript, Vite, Canvas 2D, Vitest, fast-check, Web Audio, ESLint, `tsx`, `happy-dom`. Pin exact versions.
- The Game runs locally in a browser from a Vite server or static build. No network access at runtime, no paid APIs or online services.

## Workspace and safety

- No sandbox is in use, so respect the workspace boundary strictly. Every project file and Kiro artifact stays inside the project workspace (`<workspace>`). Never access other projects.
- Use only necessary local commands. Ask the user before risky operations, paid services, publication or system-wide changes.
- No destructive operations: no recursive deletes, no force pushes, no data removal.
- Ask the user only for genuine product decisions (Open Design Questions marked needsDecision). Decide everything else by tests or simulation.
- Scientific simulations get no arbitrary short time limits. Record their duration and results.

## Windows paths

- The shell is PowerShell. Paths contain spaces, so always quote them: `"public/audio/Pixel Pulse.wav"`.
- In URLs the file is `/audio/Pixel%20Pulse.wav` (URL-encode the space).
- `public/audio/Pixel Pulse.wav` is never modified. Only read-only checks are allowed (size, SHA-256, header bytes, HTTP GET). No script may write to `public/audio`.

## Determinism lint scope

- `npm run lint` (ESLint) and `npm run lint:determinism` cover `src/core/**`.
- Forbidden there: `Date`, `performance`, `Math.random`, `requestAnimationFrame`, `crypto.getRandomValues`, `setTimeout`, `setInterval`, and imports of render, audio, input or shell.
- `src/core/tsconfig.json` has no `DOM` lib.

## Testing

- Critical gameplay tests are mandatory. A missing, skipped or unmatched test is never reported as passing. A Verify command matching zero test files is not a pass.
