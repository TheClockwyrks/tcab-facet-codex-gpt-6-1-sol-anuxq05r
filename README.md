# Facet

A browser puzzle about cut stones and chain reactions. Swap neighboring gems into lines of three. Each clear strains nearby stones; a flawed gem joins any clear touching it and scores double. Four, five, and crossing runs create brilliants, prisms, and stars with larger clearing powers.

Reach each level's target, review your best move and longest chain, and continue to a fresh board. A round ends when no productive swap remains.

## Run

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
```

## Production

```sh
npm run build
npm run preview
```

`dist/` is a complete static website. Serve its contents from any directory, including a sub-path. No backend, credentials, external requests, or asset tools are required. The build only type-checks and bundles committed files.

## Controls

- Mouse, pen, or touch: hold a gem, offer it onto an orthogonal neighbor, then release. Return to the original cell before release to cancel. Tapping one gem then its neighbor also works.
- Pointer: every menu item, Pause, and Back is an on-screen target.
- Up / Down: move the menu highlight.
- Enter / Space: choose a menu item.
- Escape / P: pause or resume.
- Escape: return from instructions or the final screen.
- M: mute all sound and music.

## Checks

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

Tests exercise matches, expansion waves, flawed scoring, cuts, prism swaps, gravity, refills, timing, levels, pointer paths, state poses, and an engine running over a native canvas with a counted clock. Asset loading reads the committed PNGs and WAVs.

## Artwork and audio

All gems, damage variants, overlays, board art, fracture frames, prism turns, particle systems, sound cues, and both musical pieces were authored for Facet. Finished assets live in `public/assets/`. The one-time authoring recipe is `tools/produce.py`; it uses the six provided asset binaries and is independent of the build. MIDI scores accompany the ready-to-play WAVs.

The Simple 2D engine owns canvas fitting, input, the clock, loading, audio, the debug overlay, and recording. The particle runtime simulates the authored systems live. Rules are in `src/logic.ts`, rendering and loading in `src/view.ts`, and the state contract and engine integration in `src/game.ts`.

`showcase/` contains screenshots and a recorded chain. With the development server running, `node tools/capture.mjs` captures it through a page-local engine instance; normal play publishes no debug globals.
