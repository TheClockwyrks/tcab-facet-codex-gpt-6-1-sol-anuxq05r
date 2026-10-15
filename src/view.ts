import type { InitApi, RenderApi } from "@clockwyrks/simple-2d";
import {
  ParticleSimulator,
  type ParticleSystem,
} from "@clockwyrks/particle-runtime";
import * as C from "./constants";
import type { FacetState, GemState } from "./game";
import {
  cellX,
  cellY,
  targets,
  menuItems,
  index,
  type VisualState,
} from "./logic";
// Decoded assets are immutable resources, never simulation state.
const images: Record<string, ImageBitmap> = {};
const systems: Record<string, ParticleSystem> = {};
export async function loadAssets(api: InitApi<FacetState>) {
  const paths = ["frame", "brilliant", "star"];
  for (const k of [...C.GEM_KINDS, "prism"])
    for (let s = 0; s <= C.MAX_STRAIN; s++) paths.push(`${k}-${s}`);
  for (const k of C.GEM_KINDS)
    for (let f = 0; f < 6; f++) paths.push(`break/${k}/${f}`);
  for (let strain = 0; strain <= C.MAX_STRAIN; strain++)
    for (let f = 0; f < 12; f++) paths.push(`prism-turn/${strain}-${f}`);
  await Promise.all([
    ...paths.map(async (p) => {
      images[p] = await api.assets.loadImage(`gems/${p}.png`);
    }),
    ...["clear", "flawed", "cut", "aura"].map(async (p) => {
      systems[p] = JSON.parse(
        await (await api.assets.load(`fx/${p}/system.json`)).text(),
      ) as ParticleSystem;
    }),
    ...Object.values(C.CUES).map((cue) =>
      api.audio.load(
        cue,
        `audio/${cue === C.CUES.clear ? "shatter" : cue}.wav`,
      ),
    ),
    ...Array.from({ length: C.MAX_MULTIPLIER }, (_, i) =>
      api.audio.load(`rung-${i + 1}`, `audio/chain${i + 1}.wav`),
    ),
    api.audio.load("theme-title", "audio/title.wav"),
    api.audio.load("theme-play", "audio/play.wav"),
  ]);
}
const ink = "#e7e6d6",
  gold = "#d2b77d",
  muted = "#829b9f",
  teal = "#7dd8cb";
function text(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  size = 16,
  color = ink,
  font = "sans-serif",
  align: CanvasTextAlign = "left",
) {
  ctx.font = `${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(str, x, y);
}
function rule(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  color = "#2b4148",
) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, 1);
}
function sprite(
  ctx: CanvasRenderingContext2D,
  key: string,
  x: number,
  y: number,
  size = 64,
) {
  if (images[key])
    ctx.drawImage(
      images[key],
      Math.round(x - size / 2),
      Math.round(y - size / 2),
      size,
      size,
    );
}
function effect(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  time: number,
  seed: number,
) {
  if (!systems[name] || time < 0 || (name !== "aura" && time > 1.2)) return;
  const sim = new ParticleSimulator(systems[name], { seed });
  for (let t = 0; t < time; t += 1 / 60)
    sim.step(Math.min(1 / 60, time - t) * 1000);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of sim.capture()) {
    ctx.globalAlpha = p.opacity;
    ctx.fillStyle = `rgb(${p.color.map((v) => Math.round(v * 255)).join(",")})`;
    ctx.beginPath();
    ctx.arc(
      x + p.position[0],
      y - p.position[1],
      Math.max(0.3, p.size),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}
function gem(
  ctx: CanvasRenderingContext2D,
  g: GemState,
  x: number,
  y: number,
  time: number,
  size = 64,
) {
  sprite(
    ctx,
    g.cut === "prism"
      ? `prism-turn/${g.strain}-${Math.floor(time * 10) % 12}`
      : `${g.kind ?? "prism"}-${g.strain}`,
    x,
    y,
    size,
  );
  if (g.cut === "brilliant" || g.cut === "star") sprite(ctx, g.cut, x, y, size);
  if (g.cut !== "plain")
    effect(ctx, "aura", x, y, 0.9 + (time % 1.2), index(g) + 42);
}
function field(ctx: CanvasRenderingContext2D) {
  const gradient = ctx.createRadialGradient(650, 330, 20, 650, 330, 760);
  gradient.addColorStop(0, "#17333d");
  gradient.addColorStop(1, "#08131b");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  ctx.strokeStyle = "#28434a";
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(640, 40 + i * 16);
    ctx.lineTo(1160 - i * 26, 360);
    ctx.lineTo(640, 690 - i * 16);
    ctx.lineTo(120 + i * 26, 360);
    ctx.closePath();
    ctx.globalAlpha = 0.11;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  rule(ctx, 48, 24, 30, gold);
  rule(ctx, 1202, 695, 30, gold);
}
function board(ctx: CanvasRenderingContext2D, s: VisualState) {
  sprite(ctx, "frame", C.BOARD_CX, C.BOARD_CY, 600);
  for (const g of s.board.cells) {
    ctx.fillStyle = (g.col + g.row) % 2 ? "#0c1c25" : "#10232c";
    ctx.fillRect(cellX(g.col) - 34, cellY(g.row) - 34, 68, 68);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(352, 108, 576, 576);
  ctx.clip();
  const shatter = s.lastWaves * C.WAVE_SECONDS;
  for (const g of s.board.cells) {
    let x = cellX(g.col),
      y = cellY(g.row);
    let draw = g;
    if (s.offer && s.selection) {
      if (index(g) === index(s.offer)) draw = s.board.cells[index(s.selection)];
      else if (index(g) === index(s.selection))
        draw = s.board.cells[index(s.offer)];
    }
    const sw = s.motion?.swap;
    if (s.phase === "swapping" && sw) {
      const a = sw[0],
        b = sw[1],
        t = 1 - s.swapTimer / C.SWAP_SECONDS;
      if (index(g) === index(a)) {
        x += (cellX(b.col) - x) * t;
        y += (cellY(b.row) - y) * t;
      } else if (index(g) === index(b)) {
        x += (cellX(a.col) - x) * t;
        y += (cellY(a.row) - y) * t;
      }
    }
    if (s.phase === "resolving") {
      if (s.stepTimer < shatter) continue;
      const elapsed = s.stepTimer - shatter;
      y -=
        Math.max(0, g.fell - elapsed / C.FALL_SECONDS_PER_ROW) * C.CELL_PITCH;
    } else if (s.motion?.dealtAt !== undefined) {
      y -=
        Math.max(
          0,
          g.fell - (s.simTime - s.motion.dealtAt) / C.FALL_SECONDS_PER_ROW,
        ) * C.CELL_PITCH;
    }
    gem(ctx, draw, x, y, s.simTime);
  }
  if (s.phase === "resolving" && s.motion?.before) {
    for (const item of s.motion.cleared ?? []) {
      const { gem: g, wave } = item,
        elapsed = s.stepTimer - wave * C.WAVE_SECONDS;
      if (elapsed < 0) gem(ctx, g, cellX(g.col), cellY(g.row), s.simTime);
      else if (elapsed < 0.24) {
        ctx.save();
        ctx.globalAlpha = 1 - elapsed / 0.24;
        sprite(
          ctx,
          `break/${g.kind ?? "ruby"}/${Math.min(5, Math.floor(elapsed * 25))}`,
          cellX(g.col),
          cellY(g.row),
        );
        ctx.restore();
      }
      effect(
        ctx,
        g.strain === C.MAX_STRAIN ? "flawed" : "clear",
        cellX(g.col),
        cellY(g.row),
        elapsed,
        index(g) + Math.floor(s.score),
      );
    }
    if (s.stepTimer < shatter)
      for (const g of s.motion.before.cells)
        if (!s.motion.cleared?.some((i) => index(i.gem) === index(g)))
          gem(ctx, g, cellX(g.col), cellY(g.row), s.simTime);
    for (const i of s.motion.created ?? [])
      effect(
        ctx,
        "cut",
        cellX(i % C.GRID_COLS),
        cellY(Math.floor(i / C.GRID_COLS)),
        s.stepTimer,
        42 + i,
      );
  }
  ctx.restore();
  for (const [p, color] of [
    [s.selection, teal],
    [s.refusal?.a, "#fc9b86"],
    [s.refusal?.b, "#fc9b86"],
  ] as const)
    if (p) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(cellX(p.col) - 33, cellY(p.row) - 33, 66, 66);
    }
}
function button(
  ctx: CanvasRenderingContext2D,
  t: ReturnType<typeof targets>[number],
  label: string,
  active: boolean,
) {
  ctx.fillStyle = active ? "#d2b77d" : "#10252e";
  ctx.fillRect(t.x, t.y, t.w, t.h);
  ctx.strokeStyle = active ? "#f4dfaa" : "#3c555b";
  ctx.strokeRect(t.x + 0.5, t.y + 0.5, t.w - 1, t.h - 1);
  text(
    ctx,
    label,
    t.x + 26,
    t.y + t.h / 2 + 6,
    17,
    active ? "#12242c" : ink,
    "sans-serif",
  );
  text(
    ctx,
    "→",
    t.x + t.w - 32,
    t.y + t.h / 2 + 6,
    22,
    active ? "#12242c" : gold,
    "serif",
    "center",
  );
}
function title(ctx: CanvasRenderingContext2D, s: FacetState) {
  text(ctx, "A STUDY IN CHAIN REACTIONS", 100, 142, 12, gold);
  text(ctx, C.TITLE_TEXT, 93, 290, 116, ink, "Georgia");
  text(ctx, C.TAGLINE_TEXT, 100, 334, 17, muted);
  rule(ctx, 100, 371, 320);
  // A constellation of the actual shipped stones, arranged as a lapidary specimen.
  const positions = [
    [875, 195, 2],
    [1010, 292, 4],
    [864, 380, 0],
    [720, 284, 5],
    [736, 479, 3],
    [1020, 490, 6],
    [900, 566, 1],
  ];
  ctx.save();
  ctx.strokeStyle = "#3c595f";
  for (const [x, y] of positions) {
    ctx.beginPath();
    ctx.moveTo(864, 380);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  ctx.restore();
  positions.forEach(([x, y, k], i) => {
    ctx.save();
    ctx.shadowColor = [
      "#e7c370",
      "#6de4d5",
      "#ed6393",
      "#6589fa",
      "#76d7a9",
      "#bc7dea",
      "#e4a353",
    ][i];
    ctx.shadowBlur = 30;
    gem(
      ctx,
      {
        col: i,
        row: 0,
        kind: C.GEM_KINDS[k],
        cut: "plain",
        strain: i === 2 ? 3 : 0,
        fell: 0,
      },
      x,
      y,
      s.simTime,
      112,
    );
    ctx.restore();
    text(ctx, `0${i + 1}`, x + 62, y + 4, 11, muted, "monospace");
  });
  text(ctx, "CUT STONES. BUILD PRESSURE. SET IT FREE.", 100, 635, 11, muted);
  text(ctx, "01 / THE LAPIDARY COLLECTION", 100, 665, 10, "#547079");
  for (const t of targets(s))
    button(
      ctx,
      t,
      menuItems(s.screen)[+t.id.slice(5)],
      s.menuIndex === +t.id.slice(5),
    );
}
function howto(ctx: CanvasRenderingContext2D, s: FacetState) {
  text(ctx, "THE ART OF PRESSURE", 72, 83, 12, gold);
  text(ctx, "How to play", 72, 139, 48, ink, "Georgia");
  rule(ctx, 72, 169, 1136);
  const entries = [
    [
      "01",
      "MAKE A LINE",
      "Seven kinds fill the grid. Take a gem with a mouse, pen,",
      "or finger. Carry it onto a neighbor and let go to play.",
      "Three of one kind shatter. Carry it back to cancel;",
      "a move that clears nothing is refused.",
    ],
    [
      "02",
      "BUILD PRESSURE",
      "Gems beside a clear take strain. Three cracks make a flaw.",
      "A flawed stone joins any clear touching it and scores double.",
      "Falling stones can match again; each chain step scores more.",
    ],
    [
      "03",
      "EARN A BETTER CUT",
      "Four in a line leave a brilliant: it clears its eight neighbors.",
      "Crossing lines leave a star: it takes the whole row and column.",
      "Five leave a prism: swap it to clear every gem of that kind.",
    ],
    [
      "04",
      "KEEP THE CHAIN ALIVE",
      "Reach the target to finish a level. Continue to a fresh board.",
      "The round ends when no productive move remains.",
      "Arrows: menus · Enter / Space: choose · Escape / P: pause",
      "M: mute · Escape: back from here or the final screen.",
    ],
  ];
  entries.forEach(([num, head, ...lines], i) => {
    const x = 72 + (i % 2) * 590,
      y = 215 + Math.floor(i / 2) * 182;
    text(ctx, num, x, y, 13, gold, "monospace");
    text(ctx, head, x + 42, y, 17, ink);
    lines.forEach((l, j) => text(ctx, l, x + 42, y + 35 + j * 24, 15, muted));
  });
  button(ctx, targets(s)[0], C.BACK_LABEL, false);
}
export function drawGame(s: VisualState, api: RenderApi) {
  const ctx = api.ctx;
  ctx.imageSmoothingEnabled = false;
  field(ctx);
  if (s.screen === "title") title(ctx, s);
  else if (s.screen === "howto") howto(ctx, s);
  else {
    if (s.board.cells.length) board(ctx, s);
    text(ctx, C.TITLE_TEXT, 54, 76, 38, ink, "Georgia");
    text(ctx, "THE LAPIDARY COLLECTION", 56, 101, 10, gold);
    text(ctx, C.HUD_SCORE_LABEL, 352, 41, 11, muted);
    text(ctx, s.score.toLocaleString("en"), 352, 79, 31, ink, "Georgia");
    text(ctx, C.HUD_LEVEL_LABEL, 856, 41, 11, muted);
    text(ctx, String(s.level).padStart(2, "0"), 856, 79, 31, ink, "Georgia");
    const progress = Math.min(
      1,
      s.levelScore / (C.LEVEL_TARGET_STEP * s.level),
    );
    ctx.fillStyle = "#2b4349";
    ctx.fillRect(490, 66, 290, 3);
    ctx.fillStyle = gold;
    ctx.fillRect(490, 66, 290 * progress, 3);
    text(
      ctx,
      `${s.levelScore.toLocaleString("en")} / ${(C.LEVEL_TARGET_STEP * s.level).toLocaleString("en")}`,
      635,
      50,
      12,
      muted,
      "monospace",
      "center",
    );
    text(ctx, "PRESSURE", 56, 249, 11, gold);
    text(ctx, "finds the flaw.", 56, 283, 23, ink, "Georgia");
    rule(ctx, 56, 306, 190);
    [0, 1, 2, 3].forEach((strain, i) => {
      sprite(ctx, `ruby-${strain}`, 76 + i * 47, 351, 40);
    });
    text(ctx, "CLEAN", 56, 401, 10, muted);
    text(ctx, "FLAWED · 2×", 235, 401, 10, gold, "sans-serif", "right");
    text(ctx, "Clear beside cracked stones", 56, 445, 13, muted);
    text(ctx, "to release a chain reaction.", 56, 468, 13, muted);
    text(ctx, "SPECIAL CUTS", 987, 234, 11, gold);
    for (const [i, cut, copy] of [
      [0, "brilliant", "Clears the surrounding ring"],
      [1, "star", "Clears a row and column"],
      [2, "prism", "Clears every matching kind"],
    ] as const) {
      gem(
        ctx,
        {
          col: i,
          row: 0,
          kind: cut === "prism" ? null : "beryl",
          cut,
          strain: 0,
          fell: 0,
        },
        1010,
        285 + i * 107,
        s.simTime,
        48,
      );
      text(ctx, cut.toUpperCase(), 1045, 280 + i * 107, 12, ink);
      text(ctx, copy, 988, 326 + i * 107, 12, muted);
    }
    if (s.phase === "resolving") {
      text(ctx, C.HUD_CHAIN_LABEL, 150, 545, 11, gold, "sans-serif", "center");
      text(
        ctx,
        `×${Math.min(s.chainStep, C.MAX_MULTIPLIER)}`,
        150,
        603,
        55,
        ink,
        "Georgia",
        "center",
      );
      text(ctx, `+${s.lastPoints}`, 150, 634, 16, teal, "monospace", "center");
    }
    text(
      ctx,
      "HOLD  /  OFFER  /  RELEASE",
      640,
      709,
      10,
      muted,
      "monospace",
      "center",
    );
    if (s.screen === "playing")
      button(ctx, targets(s)[0], C.PAUSE_LABEL, false);
    else {
      ctx.fillStyle = "#061119de";
      ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
      ctx.fillStyle = "#10242cf5";
      ctx.fillRect(426, 174, 428, 452);
      ctx.strokeStyle = "#65746a";
      ctx.strokeRect(426, 174, 428, 452);
      const heading =
        s.screen === "paused"
          ? C.PAUSED_TITLE_TEXT
          : s.screen === "levelclear"
            ? C.LEVELCLEAR_TITLE_TEXT
            : C.GAMEOVER_TITLE_TEXT;
      text(
        ctx,
        "FACET  /  " + String(s.level).padStart(2, "0"),
        640,
        227,
        12,
        gold,
        "monospace",
        "center",
      );
      text(ctx, heading, 640, 289, 36, ink, "Georgia", "center");
      if (s.screen === "levelclear") {
        text(
          ctx,
          `${C.BEST_CHAIN_LABEL}  ${s.bestChain}`,
          640,
          338,
          14,
          muted,
          "sans-serif",
          "center",
        );
        text(
          ctx,
          `${C.BEST_MOVE_LABEL}  ${s.bestMove}`,
          640,
          367,
          14,
          gold,
          "sans-serif",
          "center",
        );
      } else
        text(
          ctx,
          s.screen === "paused"
            ? "A moment to study the stones."
            : `${C.HUD_SCORE_LABEL}  ${s.score}    ${C.HUD_LEVEL_LABEL}  ${s.level}`,
          640,
          351,
          16,
          muted,
          "sans-serif",
          "center",
        );
      for (const t of targets(s))
        button(
          ctx,
          t,
          menuItems(s.screen)[+t.id.slice(5)],
          s.menuIndex === +t.id.slice(5),
        );
    }
  }
  text(
    ctx,
    s.muted ? "M / SOUND OFF" : "M / SOUND ON",
    1225,
    696,
    10,
    muted,
    "monospace",
    "right",
  );
}
