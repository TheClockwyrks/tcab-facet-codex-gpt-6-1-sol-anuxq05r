import type { Game } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import {
  debug,
  initial,
  advance,
  pointerEvent,
  choose,
  targets,
  snapshot,
} from "./logic";
import { loadAssets, drawGame } from "./view";
export type GemKind =
  "ruby" | "amber" | "citrine" | "jade" | "beryl" | "sapphire" | "amethyst";

export type Cut = "plain" | "brilliant" | "star" | "prism";

export type Screen =
  "title" | "howto" | "playing" | "paused" | "levelclear" | "gameover";

export type Phase = "idle" | "swapping" | "resolving";

export type PointerDevice = "mouse" | "pen" | "touch";

export interface CellRef {
  readonly col: number;
  readonly row: number;
}

export interface GemState {
  readonly col: number;
  readonly row: number;
  readonly kind: GemKind | null;
  readonly cut: Cut;
  readonly strain: number;
  readonly fell: number;
}

export interface BoardState {
  readonly cols: number;
  readonly rows: number;
  readonly cells: readonly GemState[];
}

export interface RefusalState {
  readonly a: CellRef;
  readonly b: CellRef;
  readonly timer: number;
}

export interface PointerState {
  readonly x: number;
  readonly y: number;
  readonly down: boolean;
  readonly device: PointerDevice;
}

export interface FacetState {
  readonly screen: Screen;
  readonly menuIndex: number;

  readonly board: BoardState;
  readonly phase: Phase;
  readonly chainStep: number;
  readonly swapTimer: number;
  readonly stepTimer: number;

  readonly score: number;
  readonly level: number;
  readonly levelScore: number;
  readonly lastCleared: number;
  readonly lastPoints: number;
  readonly lastWaves: number;

  readonly moveScore: number;
  readonly bestMove: number;
  readonly bestChain: number;

  readonly selection: CellRef | null;
  readonly offer: CellRef | null;
  readonly refusal: RefusalState | null;
  readonly armedTarget: string | null;

  readonly pointer: PointerState;
  readonly simTime: number;
  readonly muted: boolean;
  readonly refillKinds: readonly string[];
}

export type FacetDebugApi = typeof debug;
export const BACKGROUND = "#0a161e";
export const game: Game<FacetState, FacetDebugApi> = {
  async initialize(api) {
    for (const action of C.ACTIONS)
      api.input.register(action, { keys: [...C.BINDINGS[action]] });
    await loadAssets(api);
    for (const name of [
      "screen",
      "phase",
      "score",
      "level",
      "levelScore",
      "chainStep",
      "lastCleared",
      "lastPoints",
      "lastWaves",
      "bestMove",
      "bestChain",
      "legalSwap",
      "lastFall",
      "multiplier",
      "levelTarget",
    ] as const)
      api.diagnostics.register(name, (s) => snapshot(s)[name]);
    api.diagnostics.register(
      "board",
      (s) => `${s.board.cols} × ${s.board.rows}`,
    );
    api.diagnostics.register("selection", (s) => JSON.stringify(s.selection));
    api.diagnostics.register("offer", (s) => JSON.stringify(s.offer));
    api.diagnostics.register(
      "pointer",
      (s) =>
        `${s.pointer.device} ${Math.round(s.pointer.x)},${Math.round(s.pointer.y)}`,
    );
    return [initial(), debug];
  },
  update(state, api, dt) {
    let s = state;
    const cues = new Set<string>();
    const observe = (before: FacetState, after: FacetState) => {
      if (before.selection !== after.selection && after.selection)
        cues.add(C.CUES.select);
      if (after.phase === "swapping" && before.phase !== "swapping")
        cues.add(C.CUES.swap);
      if (
        after.refusal &&
        after.refusal !== before.refusal &&
        after.refusal.timer === 0
      )
        cues.add(C.CUES.refuse);
    };
    for (const sample of api.input.pointerSamples())
      if (
        sample.primary &&
        (sample.type === "move" || sample.button === "primary")
      ) {
        const n = pointerEvent(
          s,
          sample.type,
          sample.x,
          sample.y,
          sample.device,
        );
        observe(s, n);
        s = n;
      }
    const edges = Object.fromEntries(
      C.ACTIONS.map((name) => [name, api.input.pressed(name)]),
    );
    const pressed = (name: C.ActionName) => edges[name];
    if (pressed("mute")) api.audio.setMuted(!api.audio.muted());
    if (pressed("pause") && (s.screen === "playing" || s.screen === "paused"))
      s = {
        ...s,
        screen: s.screen === "playing" ? "paused" : "playing",
        menuIndex: 0,
      };
    else if (
      pressed("back") &&
      (s.screen === "howto" || s.screen === "gameover")
    )
      s = { ...s, screen: "title", menuIndex: s.screen === "howto" ? 1 : 0 };
    else {
      const menu = targets(s).filter((t) => t.id.startsWith("menu-"));
      if (menu.length && (pressed("up") || pressed("down")))
        s = {
          ...s,
          menuIndex:
            (s.menuIndex + (pressed("up") ? -1 : 1) + menu.length) %
            menu.length,
        };
      if (menu.length && pressed("confirm")) s = choose(s, s.menuIndex);
    }
    const before = s;
    let rung = 0;
    s = advance(s, dt, (cue, n) => {
      cues.add(cue);
      if (n) rung = n;
    });
    if (rung) api.audio.play(`rung-${rung}`);
    if (s.screen === "levelclear" && before.screen !== "levelclear")
      cues.add(C.CUES.levelUp);
    if (s.screen === "gameover" && before.screen !== "gameover")
      cues.add(C.CUES.gameOver);
    for (const cue of cues) api.audio.play(cue);
    const theme =
        s.screen === "title" || s.screen === "howto"
          ? "theme-title"
          : "theme-play",
      other = theme === "theme-title" ? "theme-play" : "theme-title";
    api.audio.stop(other);
    api.audio.loop(theme);
    const p = api.input.pointer();
    return {
      ...s,
      pointer: {
        x: p.x,
        y: p.y,
        down: p.buttons.includes("primary"),
        device: p.device,
      },
      muted: api.audio.muted(),
      simTime: state.simTime + dt,
    };
  },
  render: drawGame,
};
