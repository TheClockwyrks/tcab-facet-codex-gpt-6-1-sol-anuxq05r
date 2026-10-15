import * as C from "./constants";
import type {
  FacetState,
  GemState,
  GemKind,
  CellRef,
  BoardState,
  Screen,
  PointerDevice,
  Cut,
} from "./game";
export const cellX = (col: number) =>
  C.BOARD_CX - ((C.GRID_COLS - 1) * C.CELL_PITCH) / 2 + col * C.CELL_PITCH;
export const cellY = (row: number) =>
  C.BOARD_CY - ((C.GRID_ROWS - 1) * C.CELL_PITCH) / 2 + row * C.CELL_PITCH;
const letters = "RACJBSM";
const empty = (): BoardState => ({ cols: 0, rows: 0, cells: [] });
export function initial(muted = false): FacetState {
  return {
    screen: "title",
    menuIndex: 0,
    board: empty(),
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    score: 0,
    level: 1,
    levelScore: 0,
    lastCleared: 0,
    lastPoints: 0,
    lastWaves: 0,
    moveScore: 0,
    bestMove: 0,
    bestChain: 0,
    selection: null,
    offer: null,
    refusal: null,
    armedTarget: null,
    pointer: { x: 0, y: 0, down: false, device: "mouse" },
    simTime: 0,
    muted,
    refillKinds: Array(C.GRID_COLS).fill(""),
  };
}
export const index = (p: CellRef) => p.row * C.GRID_COLS + p.col;
const ref = (i: number): CellRef => ({
  col: i % C.GRID_COLS,
  row: Math.floor(i / C.GRID_COLS),
});
const near = (a: CellRef, b: CellRef) =>
  Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;
function validCell(col: number, row: number) {
  if (
    !Number.isInteger(col) ||
    !Number.isInteger(row) ||
    col < 0 ||
    row < 0 ||
    col >= C.GRID_COLS ||
    row >= C.GRID_ROWS
  )
    throw Error("Cell outside board");
}
function number(n: number, min = -Infinity) {
  if (!Number.isFinite(n) || n < min) throw Error("Invalid number");
  return n;
}
function integer(n: number, min = 0) {
  number(n, min);
  if (!Number.isInteger(n)) throw Error("Expected integer");
  return n;
}
function parse(token: string, col: number, row: number): GemState {
  if (!/^(?:[RACJBSM][0-3][bs]?|X[0-3])$/.test(token))
    throw Error("Invalid gem token");
  return {
    col,
    row,
    kind: token[0] === "X" ? null : C.GEM_KINDS[letters.indexOf(token[0])],
    strain: +token[1],
    cut:
      token[0] === "X"
        ? "prism"
        : token[2] === "b"
          ? "brilliant"
          : token[2] === "s"
            ? "star"
            : "plain",
    fell: 0,
  };
}
export function runs(board: BoardState): number[][] {
  const out: number[][] = [];
  if (!board.cells.length) return out;
  for (let axis = 0; axis < 2; axis++)
    for (let line = 0; line < C.GRID_ROWS; line++) {
      let seq: number[] = [];
      let kind: GemKind | null = null;
      for (let p = 0; p <= C.GRID_COLS; p++) {
        const i = axis ? p * C.GRID_COLS + line : line * C.GRID_COLS + p;
        const k = p < C.GRID_COLS ? board.cells[i]?.kind : null;
        if (k !== kind || !k) {
          if (seq.length >= C.MATCH_MIN) out.push(seq);
          seq = [];
        }
        if (k) seq.push(i);
        kind = k ?? null;
      }
    }
  return out;
}
function exchange(board: BoardState, a: CellRef, b: CellRef): BoardState {
  const cells = [...board.cells],
    ia = index(a),
    ib = index(b);
  if (!cells[ia] || !cells[ib]) throw Error("No gem in cell");
  const ga = cells[ia],
    gb = cells[ib];
  cells[ia] = { ...gb, ...a, fell: 0 };
  cells[ib] = { ...ga, ...b, fell: 0 };
  return { ...board, cells };
}
function productive(board: BoardState, a: CellRef, b: CellRef) {
  return (
    board.cells[index(a)]?.cut === "prism" ||
    board.cells[index(b)]?.cut === "prism" ||
    runs(exchange(board, a, b)).length > 0
  );
}
export function legalSwap(board: BoardState) {
  for (const g of board.cells)
    for (const d of [
      { col: g.col + 1, row: g.row },
      { col: g.col, row: g.row + 1 },
    ])
      if (d.col < C.GRID_COLS && d.row < C.GRID_ROWS && productive(board, g, d))
        return true;
  return false;
}
const randomKind = () =>
  C.GEM_KINDS[Math.floor(Math.random() * C.GEM_KIND_COUNT)];
export function deal(): BoardState {
  let board: BoardState;
  do {
    const cells: GemState[] = [];
    for (let row = 0; row < C.GRID_ROWS; row++)
      for (let col = 0; col < C.GRID_COLS; col++) {
        let kind: GemKind;
        do {
          kind = randomKind();
        } while (
          (col > 1 &&
            cells[cells.length - 1].kind === kind &&
            cells[cells.length - 2].kind === kind) ||
          (row > 1 &&
            cells[(row - 1) * C.GRID_COLS + col].kind === kind &&
            cells[(row - 2) * C.GRID_COLS + col].kind === kind)
        );
        cells.push({ col, row, kind, cut: "plain", strain: 0, fell: row + 1 });
      }
    board = { cols: C.GRID_COLS, rows: C.GRID_ROWS, cells };
  } while (!legalSwap(board));
  return board;
}
// Transient animation records accompany the authoritative, already-settled board.
export interface Motion {
  readonly swap?: readonly [CellRef, CellRef];
  readonly before?: BoardState;
  readonly cleared?: readonly { gem: GemState; wave: number }[];
  readonly created?: readonly number[];
  readonly dealtAt?: number;
}
export type VisualState = FacetState & { readonly motion?: Motion };
export function requestSwap(
  s: VisualState,
  a: CellRef,
  b: CellRef,
): VisualState {
  validCell(a.col, a.row);
  validCell(b.col, b.row);
  if (!s.board.cells[index(a)] || !s.board.cells[index(b)])
    throw Error("No board");
  if (s.phase !== "idle" || !near(a, b) || !productive(s.board, a, b))
    return { ...s, refusal: { a, b, timer: 0 } };
  return {
    ...s,
    board: exchange(s.board, a, b),
    phase: "swapping",
    swapTimer: 0,
    stepTimer: 0,
    chainStep: 0,
    moveScore: 0,
    refusal: null,
    motion: { swap: [a, b], before: s.board },
  };
}
const neighbors = (i: number, diagonal = false) => {
  const a = ref(i),
    out: number[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      if ((dx || dy) && (diagonal || !dx || !dy)) {
        const x = a.col + dx,
          y = a.row + dy;
        if (x >= 0 && y >= 0 && x < C.GRID_COLS && y < C.GRID_ROWS)
          out.push(y * C.GRID_COLS + x);
      }
  return out;
};
function seed(s: VisualState, first: boolean) {
  const rr = runs(s.board);
  let seeds = rr.flat();
  let prism = false;
  if (first && s.motion?.swap) {
    const [a, b] = s.motion.swap.map((p) => s.board.cells[index(p)]);
    if (a.cut === "prism" || b.cut === "prism") {
      prism = true;
      const other = a.cut === "prism" ? b : a;
      seeds = s.board.cells.flatMap((g, i) =>
        other.cut === "prism" ||
        (g.cut === "prism" && (g === a || g === b)) ||
        g.kind === other.kind
          ? [i]
          : [],
      );
    }
  }
  return { rr: prism ? [] : rr, seeds };
}
export function resolve(s: VisualState, first = false): VisualState {
  const { rr, seeds } = seed(s, first);
  if (!seeds.length) return s;
  const wave = new Map<number, number>();
  const queue: number[] = [];
  for (const i of seeds)
    if (!wave.has(i)) {
      wave.set(i, 0);
      queue.push(i);
    }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q],
      g = s.board.cells[i];
    const adds = neighbors(i).filter(
      (j) => s.board.cells[j].strain === C.MAX_STRAIN,
    );
    if (g.cut === "brilliant") adds.push(...neighbors(i, true));
    if (g.cut === "star")
      adds.push(
        ...s.board.cells.flatMap((v, j) =>
          v.col === g.col || v.row === g.row ? [j] : [],
        ),
      );
    for (const j of adds)
      if (!wave.has(j)) {
        wave.set(j, wave.get(i)! + 1);
        queue.push(j);
      }
  }
  const multiplier = Math.min(s.chainStep, C.MAX_MULTIPLIER);
  const points = queue.reduce(
    (n, i) =>
      n +
      (s.board.cells[i].strain === C.MAX_STRAIN
        ? C.FLAWED_SCORE
        : C.BASE_SCORE) *
        multiplier,
    0,
  );
  const creates = new Map<number, Cut>();
  const rank = { plain: 0, brilliant: 1, star: 2, prism: 3 };
  function create(i: number, cut: Cut) {
    if (rank[cut] > rank[creates.get(i) ?? "plain"]) creates.set(i, cut);
  }
  for (const run of rr) {
    if (run.length >= 4) {
      const swapped = run.filter((i) =>
        s.motion?.swap?.some((p) => index(p) === i),
      );
      create(
        swapped[0] ?? run[Math.floor((run.length - 1) / 2)],
        run.length >= 5 ? "prism" : "brilliant",
      );
    }
    for (const other of rr)
      if (
        other !== run &&
        (run[0] + 1 === run[1]) !== (other[0] + 1 === other[1])
      )
        for (const i of run) if (other.includes(i)) create(i, "star");
  }
  const cells: (GemState | null)[] = s.board.cells.map((g, i) =>
    wave.has(i)
      ? null
      : {
          ...g,
          strain: Math.min(
            C.MAX_STRAIN,
            g.strain + (neighbors(i).some((j) => wave.has(j)) ? 1 : 0),
          ),
          fell: 0,
        },
  );
  for (const [i, cut] of creates)
    cells[i] = {
      ...s.board.cells[i],
      cut,
      kind: cut === "prism" ? null : s.board.cells[i].kind,
      strain: 0,
      fell: 0,
    };
  for (let col = 0; col < C.GRID_COLS; col++) {
    let dst = C.GRID_ROWS - 1;
    for (let row = C.GRID_ROWS - 1; row >= 0; row--) {
      const g = cells[row * C.GRID_COLS + col];
      if (g) {
        cells[dst * C.GRID_COLS + col] = { ...g, row: dst, fell: dst - row };
        dst--;
      }
    }
    for (let row = dst; row >= 0; row--) {
      const k = s.refillKinds[col][row];
      cells[row * C.GRID_COLS + col] = {
        col,
        row,
        kind: k ? C.GEM_KINDS[letters.indexOf(k)] : randomKind(),
        cut: "plain",
        strain: 0,
        fell: dst + 1,
      };
    }
  }
  return {
    ...s,
    board: { ...s.board, cells: cells as GemState[] },
    lastCleared: queue.length,
    lastPoints: points,
    lastWaves: Math.max(...wave.values()),
    score: s.score + points,
    levelScore: s.levelScore + points,
    moveScore: s.moveScore + points,
    bestChain: Math.max(s.bestChain, s.chainStep),
    stepTimer: 0,
    motion: {
      swap: s.motion?.swap,
      before: s.board,
      cleared: queue.map((i) => ({
        gem: s.board.cells[i],
        wave: wave.get(i)!,
      })),
      created: [...creates.keys()],
    },
  };
}
export const lastFall = (s: FacetState) =>
  Math.max(0, ...s.board.cells.map((g) => g.fell));
export const stepHold = (s: FacetState) =>
  s.lastWaves * C.WAVE_SECONDS +
  lastFall(s) * C.FALL_SECONDS_PER_ROW +
  C.STEP_SECONDS;
export function advance(
  s: VisualState,
  dt: number,
  event?: (cue: string, rung?: number) => void,
): VisualState {
  const step = (state: VisualState, first = false) => {
    const n = resolve(state, first);
    if (n.score !== state.score) {
      event?.(C.CUES.clear, Math.min(state.chainStep, C.MAX_MULTIPLIER));
      if (n.motion?.created?.length) event?.(C.CUES.cut);
      const cleared = new Set(n.motion?.cleared?.map((v) => index(v.gem)));
      if (
        state.board.cells.some(
          (g, i) =>
            !cleared.has(i) &&
            g.strain === C.MAX_STRAIN - 1 &&
            neighbors(i).some((j) => cleared.has(j)),
        )
      )
        event?.(C.CUES.flaw);
    }
    return n;
  };
  if (s.screen !== "playing") return s;
  if (s.refusal)
    s = {
      ...s,
      refusal:
        s.refusal.timer + dt >= C.REFUSAL_SECONDS
          ? null
          : { ...s.refusal, timer: s.refusal.timer + dt },
    };
  let remaining = dt;
  while (remaining > 1e-10 && s.phase !== "idle") {
    const swap = s.phase === "swapping",
      timer = swap ? s.swapTimer : s.stepTimer,
      limit = swap ? C.SWAP_SECONDS : stepHold(s),
      used = Math.min(remaining, Math.max(0, limit - timer));
    remaining -= used;
    if (!swap && lastFall(s) > C.LAND_MIN_ROWS) {
      const land =
        s.lastWaves * C.WAVE_SECONDS + lastFall(s) * C.FALL_SECONDS_PER_ROW;
      if (timer < land && timer + used >= land) event?.(C.CUES.land);
    }
    if (timer + used < limit - 1e-10) {
      s = swap
        ? { ...s, swapTimer: timer + used }
        : { ...s, stepTimer: timer + used };
      break;
    }
    if (swap)
      s = step({ ...s, phase: "resolving", swapTimer: 0, chainStep: 1 }, true);
    else if (runs(s.board).length)
      s = step({ ...s, chainStep: s.chainStep + 1, stepTimer: 0 });
    else {
      s = {
        ...s,
        phase: "idle",
        chainStep: 0,
        stepTimer: 0,
        bestMove: Math.max(s.bestMove, s.moveScore),
      };
      if (s.levelScore >= C.LEVEL_TARGET_STEP * s.level)
        s = { ...s, screen: "levelclear", menuIndex: 0 };
      else if (!legalSwap(s.board))
        s = { ...s, screen: "gameover", menuIndex: 0 };
    }
  }
  return s;
}
export const menuItems = (screen: Screen): readonly string[] =>
  screen === "title"
    ? C.TITLE_ITEMS
    : screen === "paused"
      ? C.PAUSED_ITEMS
      : screen === "levelclear"
        ? C.LEVELCLEAR_ITEMS
        : screen === "gameover"
          ? C.GAMEOVER_ITEMS
          : [];
export function targets(s: FacetState) {
  if (s.screen === "playing")
    return [{ id: "pause", x: 1080, y: 24, w: 144, h: C.TARGET_MIN_H }];
  if (s.screen === "howto")
    return [{ id: "back", x: 72, y: 610, w: 160, h: C.TARGET_MIN_H }];
  return menuItems(s.screen).map((_, i) => ({
    id: `menu-${i}`,
    x: s.screen === "title" ? 100 : 480,
    y: (s.screen === "title" ? 420 : 410) + i * 88,
    w: 320,
    h: C.TARGET_MIN_H,
  }));
}
export function choose(s: VisualState, i: number): VisualState {
  if (s.screen === "title" && i === 1)
    return { ...s, screen: "howto", menuIndex: 0 };
  if ((s.screen === "title" || s.screen === "gameover") && i === 0)
    return {
      ...initial(s.muted),
      simTime: s.simTime,
      pointer: s.pointer,
      screen: "playing",
      board: deal(),
      motion: { dealtAt: s.simTime },
    };
  if (s.screen === "paused" && i === 0)
    return { ...s, screen: "playing", menuIndex: 0 };
  if (s.screen === "levelclear" && i === 0)
    return {
      ...s,
      screen: "playing",
      menuIndex: 0,
      level: s.level + 1,
      levelScore: 0,
      bestChain: 0,
      bestMove: 0,
      board: deal(),
      selection: null,
      offer: null,
      motion: { dealtAt: s.simTime },
    };
  if (i === 1)
    return {
      ...s,
      screen: "title",
      menuIndex: 0,
      board: empty(),
      phase: "idle",
      chainStep: 0,
      swapTimer: 0,
      stepTimer: 0,
      selection: null,
      offer: null,
      refusal: null,
      armedTarget: null,
      motion: undefined,
    };
  return s;
}
function hitCell(s: FacetState, x: number, y: number) {
  return s.board.cells.find(
    (g) =>
      (cellX(g.col) - x) ** 2 + (cellY(g.row) - y) ** 2 <= C.GEM_HIT_R ** 2,
  );
}
export function pointerEvent(
  s: VisualState,
  type: "down" | "move" | "up",
  x: number,
  y: number,
  device: PointerDevice = "mouse",
): VisualState {
  if (
    !["mouse", "pen", "touch"].includes(device) ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  )
    throw Error("Invalid pointer");
  s = {
    ...s,
    pointer: {
      x,
      y,
      down: type === "down" ? true : type === "up" ? false : s.pointer.down,
      device,
    },
  };
  const t = targets(s).find(
    (t) => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h,
  );
  if (t?.id.startsWith("menu-")) s = { ...s, menuIndex: +t.id.slice(5) };
  if (type === "down" && t) return { ...s, armedTarget: t.id };
  if (type === "up" && s.armedTarget) {
    const armed = s.armedTarget;
    s = { ...s, armedTarget: null };
    if (t?.id === armed) {
      if (armed === "pause") return { ...s, screen: "paused", menuIndex: 0 };
      if (armed === "back") return { ...s, screen: "title", menuIndex: 1 };
      return choose(s, +armed.slice(5));
    }
    return s;
  }
  if (s.screen !== "playing" || s.phase !== "idle" || t) return s;
  const cell = hitCell(s, x, y);
  const p = cell ? { col: cell.col, row: cell.row } : null;
  if (type === "down") {
    if (!p) return { ...s, selection: null, offer: null };
    if (s.selection && near(s.selection, p)) return { ...s, offer: p };
    return { ...s, selection: p, offer: null };
  }
  if (type === "move" && s.pointer.down && s.selection && p) {
    if (index(s.selection) === index(p)) return { ...s, offer: null };
    if (near(s.selection, p)) return { ...s, offer: p };
  }
  if (type === "up" && s.selection && s.offer)
    return {
      ...requestSwap(s, s.selection, s.offer),
      selection: null,
      offer: null,
    };
  return s;
}
export function snapshot(s: FacetState) {
  const { motion: _motion, ...plain } = s as VisualState;
  return {
    ...plain,
    version: C.FACET_DEBUG_VERSION,
    board: {
      ...s.board,
      cells: s.board.cells.map((g) => ({
        ...g,
        x: cellX(g.col),
        y: cellY(g.row),
      })),
    },
    refusal: s.refusal ? { a: s.refusal.a, b: s.refusal.b } : null,
    levelTarget: C.LEVEL_TARGET_STEP * s.level,
    multiplier: Math.min(s.chainStep, C.MAX_MULTIPLIER),
    lastFall: lastFall(s),
    stepHold: stepHold(s),
    legalSwap: legalSwap(s.board),
    targets: targets(s),
  };
}
const setValue = <K extends keyof FacetState>(
  s: FacetState,
  k: K,
  v: FacetState[K],
): FacetState => ({ ...s, [k]: v });
export const debug = {
  version: C.FACET_DEBUG_VERSION,
  reset: (s: FacetState) => initial(s.muted),
  reconcile: (s: FacetState) => ({ ...s }),
  snapshot,
  setScreen: (s: FacetState, screen: Screen) => {
    if (
      ![
        "title",
        "howto",
        "playing",
        "paused",
        "levelclear",
        "gameover",
      ].includes(screen)
    )
      throw Error("Invalid screen");
    return { ...s, screen };
  },
  setMenuIndex: (s: FacetState, index: number) => ({
    ...s,
    menuIndex: integer(index),
  }),
  loadBoard: (s: FacetState, rows: readonly string[]) => {
    if (rows.length !== C.GRID_ROWS) throw Error("Expected eight rows");
    return {
      ...s,
      board: {
        cols: C.GRID_COLS,
        rows: C.GRID_ROWS,
        cells: rows.flatMap((r, row) => {
          const tokens = r.trim().split(/\s+/);
          if (tokens.length !== C.GRID_COLS)
            throw Error("Expected eight columns");
          return tokens.map((t, col) => parse(t, col, row));
        }),
      },
    };
  },
  dealBoard: (s: FacetState) => ({
    ...s,
    board: deal(),
    motion: { dealtAt: s.simTime },
  }),
  clearBoard: (s: FacetState) => ({ ...s, board: empty() }),
  setGem: (s: FacetState, col: number, row: number, token: string) => {
    validCell(col, row);
    if (!s.board.cells[row * C.GRID_COLS + col]) throw Error("No board");
    return {
      ...s,
      board: {
        ...s.board,
        cells: s.board.cells.map((g) =>
          g.col === col && g.row === row ? parse(token, col, row) : g,
        ),
      },
    };
  },
  setRefillKinds: (s: FacetState, col: number, kinds: string) => {
    integer(col);
    if (col >= C.GRID_COLS || !/^[RACJBSM]*$/.test(kinds))
      throw Error("Invalid refill");
    return {
      ...s,
      refillKinds: s.refillKinds.map((v, i) => (i === col ? kinds : v)),
    };
  },
  clearRefillKinds: (s: FacetState) => ({
    ...s,
    refillKinds: Array(C.GRID_COLS).fill(""),
  }),
  setScore: (s: FacetState, n: number) => setValue(s, "score", number(n)),
  setLevel: (s: FacetState, n: number) => setValue(s, "level", integer(n, 1)),
  setLevelScore: (s: FacetState, n: number) =>
    setValue(s, "levelScore", number(n)),
  setBestChain: (s: FacetState, n: number) =>
    setValue(s, "bestChain", integer(n)),
  setBestMove: (s: FacetState, n: number) => setValue(s, "bestMove", number(n)),
  setMoveScore: (s: FacetState, n: number) =>
    setValue(s, "moveScore", number(n)),
  setSelection: (s: FacetState, col: number, row: number) => {
    validCell(col, row);
    return { ...s, selection: { col, row } };
  },
  clearSelection: (s: FacetState) => ({ ...s, selection: null }),
  setOffer: (s: FacetState, col: number, row: number) => {
    validCell(col, row);
    return { ...s, offer: { col, row } };
  },
  clearOffer: (s: FacetState) => ({ ...s, offer: null }),
  clearRefusal: (s: FacetState) => ({ ...s, refusal: null }),
  clearChain: (s: FacetState) => ({
    ...s,
    phase: "idle" as const,
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
  }),
  requestSwap: (
    s: FacetState,
    colA: number,
    rowA: number,
    colB: number,
    rowB: number,
  ) => requestSwap(s, { col: colA, row: rowA }, { col: colB, row: rowB }),
  pointerDown: (
    s: FacetState,
    x: number,
    y: number,
    device: PointerDevice = "mouse",
  ) => pointerEvent(s, "down", x, y, device),
  pointerMove: (
    s: FacetState,
    x: number,
    y: number,
    device: PointerDevice = "mouse",
  ) => pointerEvent(s, "move", x, y, device),
  pointerUp: (s: FacetState, device: PointerDevice = "mouse") =>
    pointerEvent(s, "up", s.pointer.x, s.pointer.y, device),
};
