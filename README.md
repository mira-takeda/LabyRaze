# LABYRAZE Halloween Maze

LABYRAZE is an original, endless Halloween arcade maze game that runs in the browser. You play a Maze Spirit in a procedurally generated maze. Shadow Bite, an autonomous smoky hunter, hunts in the same maze and competes with you for the same resources. There is no final level.

It was built for the Kiroween hackathon with Kiro spec-driven development. The `.kiro` directory holds the specs (requirements, design, tasks), the steering rules and the hooks used during development.

Sound effects are synthesized at runtime. All fifteen characters (eight protagonists, seven antagonists) are original pixel art defined in code, and the owner reports generating the music with Flow. See [LICENSE-SCOPE.md](LICENSE-SCOPE.md) for rights and unresolved permissions.

## Requirements

- Node.js 22.12 or newer (`engines` in `package.json`) and npm.
- A current desktop browser with Canvas 2D and Web Audio (Edge, Chrome or Firefox).
- Everything runs locally. The game needs no network access at runtime and uses no online services.

## Install

```
npm install
```

## Run

| Command | What it does | URL |
| --- | --- | --- |
| `npm run dev` | Vite development server | http://localhost:5173/ |
| `npm run build` | type-check and production build into `dist` | |
| `npm run preview` | serves the production build | http://localhost:4173/ |

Click the page or press a key once so the browser allows audio. A fixed maze sequence is available with `?seed=123`.

## Gameplay

- **You win a level** by freeing all three Captives. Each Captive needs one Key, carried to the Cage entrance.
- **Shadow Bite wins a level** by eating every Ordinary Pellet first. Only Shadow Bite collects Ordinary Pellets (the warm yellow-orange ones).
- **Power Pellets** give Power_State to one holder at a time. A Power Pellet taken by one character cancels the other's power. **Speed Pellets** give a speed boost and can coexist with Power_State.
- **Doors** open and close on a seeded schedule with a warning glow. Nobody controls them.
- **Bombs** are collected only by you (up to 3 carried). Press Space to detonate one at your position. It destroys breakable walls within 3.0 Cells. The Cage, its gate and the outer boundary never break. The maze stays solvable afterwards.
- **Ghost Hunt** is a collectible that starts at once. The three allied ghosts leave the Cage and chase Shadow Bite for a limited time, then go back. It never changes your rescue progress or carried Keys.
- **Spirit Wisps** are cool-coloured orbs only you can collect. Each gives points times the Combo multiplier. Collecting Wisps in quick succession raises the Combo (capped at x5). The Combo changes score only, never the win conditions. Wisps never count as Ordinary Pellets.
- **Lives:** you start with 3. You gain a life (1UP) at 10,000, 25,000 and 50,000 points and then every 50,000, and one extra life every 5 levels won. A run ends when your lives reach 0.
- **Endless levels:** every win generates a new seeded maze and both characters get a small speed increase. The visual biome changes every 5 levels. A CONGRATULATIONS celebration appears at levels 100, 150, 200 and every 50 levels after that. The game continues.
- **High scores:** the top 10 are stored in the browser's local storage.

## Controls

| Key | Action |
| --- | --- |
| Arrow keys or W A S D | Move. Turns are buffered until they are possible. |
| Space | Detonate a Bomb |
| Esc or P | Pause menu |
| Enter (or numpad Enter) | Confirm, continue, accept a high score name |
| F | Toggle fullscreen (not in text entry or key rebinding) |

Keys can be remapped in Settings, with a primary and a secondary key per action. Settings also has volume and mute controls, fullscreen, and a **Reduced motion** option that turns off screen shake and softens flashes. Reduced motion starts from your OS preference. The Settings are saved in the browser.

## Character Workshop

Open it from the title screen: **title screen, then Character Workshop**.

- Tools: pencil (B), eraser (E), fill (G), colour picker (I), and mirror draw (M). Pick colours from the palette.
- Undo with Ctrl+Z and redo with Ctrl+Y.
- Give the design a name, then **Save**. **Use** applies a saved design in the game. **Use default** restores the default look of that character.
- **Export all** writes every saved design to `labyraze-skins.json`. **Import** reads such a file back.
- Two kinds: Protagonist skins (18x24, at least 60 pixels) and Antagonist skins (24x24, at least 80 pixels). Up to 12 saved designs per kind.
- Eight built-in protagonists and seven built-in antagonists are selectable immediately, including the previous Maze Spirit and Shadow Bite designs as Classic alternatives. **Copy** starts a custom variant from any built-in.
- Designs are saved in local storage under `kirobit.skins.v1`. Skins saved before the rebrand (including 12x12 antagonist pictures) still load.

Skins are cosmetic only. They never change collision, abilities, AI, score or victory conditions.

## 30-lives cheat

A cheat exists for testing and for players who want to see deep levels. On the title screen, type `KIROGHOST` (the keys K I R O G H O S T) or the classic arcade code (Up Up Down Down Left Right Left Right B A). The title screen then shows `30 LIVES CHEAT ON`. Typing the code again turns it off. A run started with the cheat gives 30 starting lives, otherwise the same rules. Cheat runs are marked in the game (`CHEAT RUN`) and their scores are kept on a separate CHEAT RUNS high score table, never in the normal top 10.

## Development

| Command | What it does |
| --- | --- |
| `npm test` | unit and DOM tests (Simulation, render, shell, audio with a mock context, tools) |
| `npm run test:sim` | Simulation suites only |
| `npm run test:mechanics` | Bombs, Ghost Hunt and Spirit Wisps |
| `npm run test:audio` | audio engine and Soundtrack integrity tests |
| `npm run test:perf` | Tick performance (p95 at most 2 ms over 10,000+ Ticks) |
| `npm run test:e2e` | end-to-end multi-level run to game over |
| `npm run lint` | ESLint, including the determinism and layering rules for `src/core` |
| `npm run lint:determinism` | scans `src/core` for wall-clock and unseeded randomness APIs |
| `npm run check:soundtrack` | read-only size and SHA-256 check of the Soundtrack |
| `npm run perf:browser` | scripted browser frame-time check (requires a real measurement; `-- --optional` reports `SKIPPED` with exit 2 when prerequisites are unavailable) |

### Balance simulator

The balance tools run the real Simulation headless with automated Player policies.

| Command | What it does |
| --- | --- |
| `npm run balance:measure` | measures the baseline and writes `tools/balance/baseline.json` |
| `npm run balance:calibrate -- <ghostHunt\|bombRadius\|bombs\|wisps\|combo>` | parameter sweeps, written to `tools/balance/calibration.json` |
| `npm run balance:check` | compares a fresh run against the committed bands (exit 1 on failure) |
| `npm run balance:smoke` | small fixed Seed set within 30 seconds |
| `npm run balance:full` | measure followed by check |

Options: `--n <seeds>`, `--base-seed <seed>`, `--workers <k>`, `--budget-ms <ms>`, `--json`.

### Browser performance check

`?perf=1` (for example http://localhost:4173/?perf=1 after `npm run build` and `npm run preview`) runs a scripted bot for 30 seconds and stores the result in `window.__kirobitPerf` (Frame_Time p95 at most 16.7 ms).

### Architecture

- `src/core` is the deterministic Simulation: maze generation, rules, hunter AI (Shadow Bite), progression. It advances in fixed 60 Hz Ticks, takes all randomness from a seeded PRNG and never touches the DOM, clocks, rendering or audio. The same seed, config and inputs give the same state.
- `src/render`, `src/audio` and `src/shell` observe Simulation state and events. They never change Simulation state.
- `tools` holds the balance simulator and the check scripts. `tests` mirrors the areas above.

## Soundtrack

`public/audio/Pixel Pulse.opus` is the owner's own music in distribution form (Opus 160 kbps VBR) and is not part of the code. Never edit, move, rename, overwrite or delete it. `npm run check:soundtrack` verifies its size and SHA-256 against `tests/fixtures/soundtrack.json` without writing anything, and fails when the master WAV is left in `public/audio`. The uncompressed master recording `Pixel Pulse.wav` (33,926,694 bytes, SHA-256 `137D2DF0ABD3C5ED079D0B1B80858D7F14C4D0AE1E9C4DC43A2F5BBC7AE13147`) is never edited or overwritten and is kept outside `public/` so builds ship only the Opus file; see [ASSETS.md](ASSETS.md).

## Assets

See [ASSETS.md](ASSETS.md) for the source and license of every asset category.

## Status and licensing

Original software is licensed under **GPL-3.0-only**, with the full terms in [LICENSE](LICENSE). Recorded music, artwork, third-party material and trademarks have separate scope in [LICENSE-SCOPE.md](LICENSE-SCOPE.md). This build is not cleared for public publication until the remaining asset and brand permissions are resolved. See [RELEASE-AUDIT.md](RELEASE-AUDIT.md), [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md) and [REBRANDING-PLAN.md](REBRANDING-PLAN.md).

Release verification: `npm run verify:release` runs required gates sequentially and saves actual exit codes and sanitized transcripts in `docs/verification/`. Tests with no matches, focused tests and unexecuted required assertions fail. Explicit optional skips must carry a `[optional: reason]` title and are reported separately. The historical balance baseline is never remeasured by release verification.

Audio fallback: the audio-only `public/audio/Pixel Pulse.mp3` is tried when Opus is unsupported or loading fails. The master WAV is never shipped.

## GitHub Pages preparation (not published)

This repository includes a GitHub Actions workflow at `.github/workflows/pages.yml` to build and deploy the **static browser game** to GitHub Pages, when public publication is approved.

- **Local development and preview stay unchanged:** `npm run dev` serves `http://localhost:5173/`, and `npm run build && npm run preview` serves `http://localhost:4173/`.
- **Pages-only build:** CI sets `LABYRAZE_PAGES_BUILD=1` so Vite uses `/LabyRaze/` as its base. The game resolves its music URLs against Vite's base; both `Pixel Pulse.opus` and its MP3 fallback are included in `dist/audio/`.
- **Safety gate:** while the repository is private, CI can build and validate the Pages bundle but **does not upload a Pages artifact or deploy a public site**. No Pages site is active just because this workflow exists.
- **To publish later, with the owner's approval:** make the repository public (or use a plan supporting private Pages), then in **Settings → Pages → Build and deployment → Source** choose **GitHub Actions**. Run the **LABYRAZE GitHub Pages** workflow manually on `main` under **Actions**, or push a new commit to `main`. Check the workflow result and test gameplay plus music at `https://mira-takeda.github.io/LabyRaze/`.
- **No gameplay changes:** the Pages build changes only the asset base path. Game rules, sprites, saves, the original audio files and local development URLs are unaffected.

The repository is currently private and publishing is a separate decision; see [LICENSE-SCOPE.md](LICENSE-SCOPE.md) for the distinction between the GPL-covered software and separately scoped music/artwork.
