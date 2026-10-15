/// <reference types="node" />
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import { createEngine, ConstantClock } from "@clockwyrks/simple-2d";
import { game, type FacetState } from "./game";
import {
  initial,
  debug,
  runs,
  deal,
  resolve,
  advance,
  requestSwap,
  cellX,
  cellY,
  snapshot,
  stepHold,
} from "./logic";
import * as C from "./constants";
const pattern = Array.from({ length: C.GRID_ROWS }, (_, row) =>
  Array.from(
    { length: C.GRID_COLS },
    (_, col) => "RACJBSM"[(row * 2 + col) % 7] + "0",
  ).join(" "),
);
function board() {
  return debug.setScreen(debug.loadBoard(initial(), pattern), "playing");
}
function put(
  s: FacetState,
  items: readonly (readonly [number, number, string])[],
) {
  return items.reduce((s, [x, y, t]) => debug.setGem(s, x, y, t), s);
}
function refill(s: FacetState) {
  for (let col = 0; col < C.GRID_COLS; col++)
    s = debug.setRefillKinds(
      s,
      col,
      Array.from({ length: 8 }, (_, r) => "RACJBSM"[(r * 2 + col) % 7]).join(
        "",
      ),
    );
  return s;
}
beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    async (url: string) =>
      new Response(
        await readFile(new URL("../public/" + url, import.meta.url)),
      ),
  );
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
  vi.stubGlobal(
    "AudioContext",
    class {
      async decodeAudioData(bytes: ArrayBuffer) {
        expect(Buffer.from(bytes).toString("ascii", 0, 4)).toBe("RIFF");
        return { duration: 1 };
      }
    },
  );
});
afterAll(() => vi.unstubAllGlobals());
describe("dealing and state poses", () => {
  it("deals full, match-free playable boards", () => {
    for (let i = 0; i < 20; i++) {
      const b = deal();
      expect(b.cells).toHaveLength(64);
      expect(runs(b)).toEqual([]);
      expect(snapshot({ ...initial(), board: b }).legalSwap).toBe(true);
      expect(
        b.cells.every(
          (g) => g.fell >= g.row + 1 && g.strain === 0 && g.cut === "plain",
        ),
      ).toBe(true);
    }
  });
  it("validates notation and domains loudly", () => {
    const s = board();
    expect(() => debug.loadBoard(s, ["R0"])).toThrow();
    expect(() => debug.setGem(s, 0, 0, "X0b")).toThrow();
    expect(() => debug.setGem(s, 8, 0, "R0")).toThrow();
    expect(() => debug.setLevel(s, 0)).toThrow();
    expect(() => debug.setMenuIndex(s, -1)).toThrow();
    expect(() => debug.setRefillKinds(s, 0, "X")).toThrow();
    expect(() => debug.requestSwap(initial(), 0, 0, 1, 0)).toThrow();
  });
  it("poses each value without touching the others and resets every declared field", () => {
    let s = board();
    s = debug.setScore(s, 123);
    s = debug.setLevel(s, 4);
    s = debug.setLevelScore(s, 50);
    s = debug.setBestChain(s, 5);
    s = debug.setBestMove(s, 400);
    s = debug.setMoveScore(s, 30);
    s = debug.setMenuIndex(s, 7);
    s = debug.setSelection(s, 1, 2);
    s = debug.setOffer(s, 2, 2);
    s = debug.setRefillKinds(s, 0, "RAC");
    expect(snapshot(s)).toMatchObject({
      score: 123,
      level: 4,
      levelTarget: 8000,
      levelScore: 50,
      bestChain: 5,
      bestMove: 400,
      moveScore: 30,
      menuIndex: 7,
      selection: { col: 1, row: 2 },
      offer: { col: 2, row: 2 },
    });
    expect(debug.reconcile(s)).toEqual(s);
    expect(debug.reset({ ...s, muted: true })).toEqual(initial(true));
    expect(debug.clearBoard(s).board.cells).toEqual([]);
    expect(debug.clearSelection(s).offer).toEqual(s.offer);
    expect(debug.clearOffer(s).selection).toEqual(s.selection);
    expect(debug.clearRefillKinds(s).refillKinds.every((k) => !k)).toBe(true);
  });
});
describe("runs, expansion, scoring and gravity", () => {
  it("finds only maximal runs and excludes prisms", () => {
    let s = put(board(), [
      [0, 0, "R0"],
      [1, 0, "R0"],
      [2, 0, "R0"],
      [3, 0, "R0"],
    ]);
    expect(runs(s.board).some((r) => r.join(",") === "0,1,2,3")).toBe(true);
    s = debug.setGem(s, 1, 0, "X0");
    expect(runs(s.board).some((r) => r.includes(0))).toBe(false);
  });
  it("scores flawed stones twice and grows waves through flawed neighbors", () => {
    let s = put(board(), [
      [0, 0, "R0"],
      [1, 0, "R0"],
      [2, 0, "R0"],
      [2, 1, "J3"],
      [2, 2, "B3"],
      [3, 2, "A2"],
    ]);
    s = refill(s);
    const n = resolve({ ...s, phase: "resolving", chainStep: 2 });
    expect(n.lastCleared).toBe(5);
    expect(n.lastPoints).toBe(140);
    expect(n.lastWaves).toBe(2);
    expect(
      n.board.cells.find(
        (g) => g.kind === "amber" && g.col === 3 && g.row === 2,
      )?.strain,
    ).toBe(3);
    expect(n.moveScore).toBe(140);
    expect(s.score).toBe(0);
  });
  it("expands brilliants and stars to closure", () => {
    const s = put(board(), [
      [1, 1, "R0b"],
      [0, 1, "R0"],
      [2, 1, "R0"],
      [2, 2, "J0s"],
    ]);
    const n = resolve({ ...refill(s), chainStep: 1 });
    expect(n.lastCleared).toBe(19);
    expect(n.lastWaves).toBeGreaterThan(1);
  });
  it("creates a brilliant, a prism, and an intersecting star", () => {
    for (const [length, cut] of [
      [4, "brilliant"],
      [5, "prism"],
    ] as const) {
      const s = put(
        board(),
        Array.from({ length }, (_, i) => [i, 7, "R0"] as const),
      );
      const n = resolve({ ...refill(s), chainStep: 1 });
      expect(n.board.cells.some((g) => g.cut === cut && g.row === 7)).toBe(
        true,
      );
    }
    const s = put(board(), [
      [2, 2, "R0"],
      [3, 2, "R0"],
      [4, 2, "R0"],
      [3, 1, "R0"],
      [3, 3, "R0"],
    ]);
    const n = resolve({ ...refill(s), chainStep: 1 });
    expect(
      n.board.cells.some((g) => g.cut === "star" && g.kind === "ruby"),
    ).toBe(true);
  });
  it("keeps survivors ordered with strain and cut, and uses column refill rows", () => {
    let s = put(board(), [
      [0, 7, "R0"],
      [1, 7, "R0"],
      [2, 7, "R0"],
      [0, 6, "J1b"],
      [0, 5, "B2"],
    ]);
    s = debug.setRefillKinds(s, 0, "M");
    const n = resolve({ ...s, chainStep: 1 });
    expect(n.board.cells[56]).toMatchObject({
      kind: "jade",
      cut: "brilliant",
      strain: 2,
      fell: 1,
    });
    expect(n.board.cells[48]).toMatchObject({
      kind: "beryl",
      strain: 2,
      fell: 1,
    });
    expect(n.board.cells[0]).toMatchObject({ kind: "amethyst", fell: 1 });
  });
  it("seeds prism-kind swaps and double-prism swaps", () => {
    let s = put(board(), [
      [0, 0, "X0"],
      [1, 0, "J0"],
    ]);
    s = requestSwap(s, { col: 0, row: 0 }, { col: 1, row: 0 });
    const count = s.board.cells.filter(
      (g) => g.kind === "jade" || g.cut === "prism",
    ).length;
    let n = advance(s, C.SWAP_SECONDS);
    expect(n.lastCleared).toBe(count);
    s = put(board(), [
      [0, 0, "X0"],
      [1, 0, "X0"],
    ]);
    n = advance(
      requestSwap(s, { col: 0, row: 0 }, { col: 1, row: 0 }),
      C.SWAP_SECONDS,
    );
    expect(n.lastCleared).toBe(64);
    expect(n.board.cells.every((g) => g.fell > 0)).toBe(true);
  });
});
describe("swap timing, level boundaries and pointer path", () => {
  function move() {
    return refill(
      put(board(), [
        [0, 0, "R0"],
        [1, 0, "R0"],
        [2, 0, "J0"],
        [2, 1, "R0"],
      ]),
    );
  }
  it("refuses distant or unproductive moves without exchanging gems", () => {
    const s = board();
    for (const b of [
      { col: 7, row: 7 },
      { col: 1, row: 0 },
    ]) {
      const n = requestSwap(s, { col: 0, row: 0 }, b);
      expect(n.board).toEqual(s.board);
      expect(n.refusal).not.toBeNull();
    }
    expect(
      advance(
        { ...requestSwap(s, { col: 0, row: 0 }, { col: 7, row: 7 }) },
        C.REFUSAL_SECONDS,
      ).refusal,
    ).toBeNull();
  });
  it("waits for swap duration, preserves fell at rest and integrates split deltas", () => {
    const s = requestSwap(move(), { col: 2, row: 0 }, { col: 2, row: 1 });
    expect(s.phase).toBe("swapping");
    expect(advance(s, 0.17).score).toBe(0);
    const a = advance(s, 0.2),
      b = advance(advance(s, 0.1), 0.1);
    expect(a).toEqual(b);
    expect(a.phase).toBe("resolving");
    expect(a.stepTimer).toBeCloseTo(0.02);
    const n = advance(a, stepHold(a));
    expect(n.phase).toBe("idle");
    expect(n.bestMove).toBeGreaterThan(0);
    expect(n.board.cells.some((g) => g.fell > 0)).toBe(true);
  });
  it("freezes timers on overlays and finishes a level before checking moves", () => {
    let s = requestSwap(move(), { col: 2, row: 0 }, { col: 2, row: 1 });
    expect(advance({ ...s, screen: "paused" }, 4).swapTimer).toBe(0);
    s = advance({ ...s, levelScore: 2000 }, 2);
    expect(s.screen).toBe("levelclear");
    const next = debug.pointerUp(debug.pointerDown(s, 500, 440));
    expect(next.level).toBe(2);
    expect(next.levelScore).toBe(0);
    expect(next.score).toBe(s.score);
  });
  it("offers only neighbors and releases or withdraws without mutating the input", () => {
    const s = move();
    let n = debug.pointerDown(s, cellX(2), cellY(1), "touch");
    n = debug.pointerMove(n, cellX(2), cellY(0), "touch");
    expect(n.offer).toEqual({ col: 2, row: 0 });
    const swapped = debug.pointerUp(n, "touch");
    expect(swapped.phase).toBe("swapping");
    expect(swapped.selection).toBeNull();
    n = debug.pointerMove(n, cellX(2), cellY(1), "touch");
    expect(debug.pointerUp(n).phase).toBe("idle");
    expect(s.selection).toBeNull();
  });
  it("operates title, help, pause and quit through reported targets", () => {
    let s = initial();
    s = debug.pointerDown(s, 150, 550);
    s = debug.pointerUp(s);
    expect(s.screen).toBe("howto");
    s = debug.pointerUp(debug.pointerDown(s, 100, 640));
    expect(s.screen).toBe("title");
    expect(s.menuIndex).toBe(1);
    s = debug.pointerUp(debug.pointerDown(s, 150, 450));
    expect(s.screen).toBe("playing");
    s = debug.pointerUp(debug.pointerDown(s, 1100, 50));
    expect(s.screen).toBe("paused");
    s = debug.pointerUp(debug.pointerDown(s, 500, 530));
    expect(s.screen).toBe("title");
    expect(s.board.cells).toEqual([]);
  });
});
describe("engine integration with committed assets", () => {
  it("initializes, poses, advances counted frames, draws and records", async () => {
    const canvas = createCanvas(C.STAGE_W, C.STAGE_H);
    const events = new EventTarget();
    const engine = createEngine({
      canvas: canvas as unknown as HTMLCanvasElement,
      width: C.STAGE_W,
      height: C.STAGE_H,
      game,
      background: "#0a161e",
      layout: C.LAYOUT,
      clock: new ConstantClock(10),
      surface: {
        cssWidth: () => C.STAGE_W,
        cssHeight: () => C.STAGE_H,
        dpr: () => 1,
        events: () => events,
      },
    });
    await engine.initialize();
    expect(engine.debug.version).toBe(C.FACET_DEBUG_VERSION);
    await engine.advance(1);
    engine.apply(() =>
      refill(
        put(board(), [
          [0, 0, "R0"],
          [1, 0, "R0"],
          [2, 0, "J0"],
          [2, 1, "R0"],
        ]),
      ),
    );
    engine.apply((s) => engine.debug.requestSwap(s, 2, 0, 2, 1));
    engine.startRecording();
    await engine.advance(18);
    expect(engine.state.phase).toBe("resolving");
    expect(engine.state.score).toBe(30);
    await engine.advance(100);
    expect(engine.state.phase).toBe("idle");
    expect(engine.state.simTime).toBeCloseTo(1.18);
    expect(engine.stopRecording().frames).toHaveLength(118);
    expect(engine.diagnostics().every((d) => d.error === undefined)).toBe(true);
    engine.destroy();
  });
});

describe("round endings and cut precedence", () => {
  it("ends a settled dead board and starts a completely fresh round", () => {
    const s = advance(
      {
        ...board(),
        phase: "resolving",
        chainStep: 1,
        score: 450,
        moveScore: 80,
      },
      C.STEP_SECONDS,
    );
    expect(s.screen).toBe("gameover");
    expect(s.bestMove).toBe(80);
    const target = snapshot(s).targets[0];
    const next = debug.pointerUp(
      debug.pointerDown(s, target.x + 20, target.y + 20),
    );
    expect(next.screen).toBe("playing");
    expect(next.score).toBe(0);
    expect(next.level).toBe(1);
    expect(next.bestMove).toBe(0);
    expect(runs(next.board)).toEqual([]);
  });
  it("gives a prism precedence over an intersecting star and caps scoring", () => {
    const s = put(board(), [
      [0, 7, "A0"],
      [1, 7, "R0"],
      [2, 7, "R0"],
      [3, 7, "R0"],
      [4, 7, "R0"],
      [5, 7, "R0"],
      [3, 6, "R0"],
      [3, 5, "R0"],
    ]);
    const n = resolve({ ...refill(s), chainStep: C.MAX_MULTIPLIER + 4 });
    expect(n.board.cells[7 * 8 + 3]).toMatchObject({
      cut: "prism",
      kind: null,
      strain: 0,
    });
    expect(n.lastPoints).toBe(7 * C.BASE_SCORE * C.MAX_MULTIPLIER);
  });
});
