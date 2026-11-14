// The orb lattice's choreography, independent of how it is drawn.
//
// The conversation screen's one visual is a ring lattice of glass beads (the brand's
// orb reference, Hero Concept slide 15 and the "Voice Orb" frames on page 07 of the
// concept file): an empty centre, eight small rounded squares at the clock's 45°
// positions, twelve pills every 30° farther out all lying the same way, and twelve
// circles at the rim between them. This module
// decides where every bead is, how big, how bright and how far it has been pushed
// out from the centre, once per frame. It knows
// nothing about canvases or WebGL; orbClusterRenderer.ts draws the poses.
//
// Whose turn it is shows as behaviour:
//
//   entering   each bead pops from zero with a clockwise stagger and a size overshoot;
//              each ring follows the last through one turn and a soft catch back.
//              A ~2.6 s overlay on the live state, not another conversation state.
//   ongoing    a slow quarter-turn sway, inner ring leading middle leading rim, with
//              looping springy bead-size pulses travelling inward while listening and
//              outward while speaking. Voice level strengthens the loop.
//              The Sep 9 motion reference: follow-through, not one rigid spinning disc.
//   listening  holds its shape; the visitor's voice RIPPLES inward from the rim as
//              brightness and a small push, resting dim in pauses.
//   thinking   BREATHES, gently: the lattice swells and relaxes by a few percent every
//              ~2.6 s. Pensive, not dramatic, and never
//              far from its listening size — a visitor waiting for an answer must not
//              watch it vanish. The shared sway and size pulses continue through it.
//   speaking   the agent's voice swells each bead and PUSHES it outward,
//              radiating from the centre with every syllable. (A swirl — the lattice
//              turning, inner rings faster than the rim, the voice driving the speed —
//              is coded but off; see SWIRL.)
//   settling   the reveal: the beads spiral inward and converge into the persona
//              sphere — "the field blooms and settles into the final composition".
//              Then the lattice is gone.
//
// Every quantity eases toward its target through persistent state, so a change of
// turn reads as a change of behaviour, not a cut. `prefers-reduced-motion` removes
// the spin, the breath and the push, leaving brightness.
//
// Two loudness envelopes. Brightness follows a slow one: speech has 4–6 syllables a
// second, and brightness that followed it raw would flash faster than WCAG 2.3.1's
// three-per-second limit; the slow smoother rolls off above ~1.5 Hz. Shape and
// position follow a fast one (80 ms attack, 300 ms release) — the flash limit is about
// luminance, not motion, and a bulge that lags the voice by a syllable reads as unrelated.

import type { TurnState } from "./protocol";

export type BeadShape = "square" | "pill" | "circle";

export interface RingSpec {
  /** ring radius as a fraction of the lattice width */
  r: number;
  /** beads in the ring */
  n: number;
  shape: BeadShape;
  /** bead diameter (the short axis, for a pill) as a fraction of the lattice width */
  size: number;
  /** angular offset so rings do not line up into spokes */
  offset: number;
}

/** The lattice, centre outward, to the concept file's Voice Orb frames: eight squares
 *  at 12, 1:30, 3, 4:30, 6, 7:30, 9 and 10:30 o'clock (angle 0 is 3 o'clock, so an
 *  offset of 0 lands on them); twelve pills every 30° from 12 o'clock, all lying the
 *  same way (the renderer sets the orientation); twelve circles at the rim every 30°,
 *  15° off the pills. Drawn in tight (Sep 8): the pill and circle rings sit as close as
 *  the push allows — a pill lying along its radius, pushed out at full voice, just
 *  clears the circles, and twelve pills side by side just clear each other
 *  (lattice.test.ts). */
export const RINGS: RingSpec[] = [
  { r: 0.12, n: 8, shape: "square", size: 0.055, offset: 0 },
  { r: 0.225, n: 12, shape: "pill", size: 0.07, offset: 0 },
  { r: 0.345, n: 12, shape: "circle", size: 0.075, offset: Math.PI / 12 },
];
/** A pill's long axis over its short one (1.5 until Sep 8; brought in 20%). */
export const PILL_ASPECT = 1.2;

export interface LatticePoint {
  angle: number;
  base: number;
  /** 0 at the innermost ring, 1 at the rim */
  ring: number;
  /** ring index */
  ri: number;
  shape: BeadShape;
  size: number;
  /** slight per-bead lead/lag in the bloom */
  phase: number;
  /** clockwise reveal order within the ring, 0..1 starting at the top */
  entryOrder: number;
  /** stable per-bead noise seed, so the beads do not breathe in lockstep */
  seed: number;
}

export const LATTICE: LatticePoint[] = (() => {
  const pts: LatticePoint[] = [];
  RINGS.forEach((ring, ri) => {
    for (let i = 0; i < ring.n; i++) {
      pts.push({
        angle: (i / ring.n) * Math.PI * 2 + ring.offset,
        base: ring.r,
        ring: ri / (RINGS.length - 1),
        ri,
        shape: ring.shape,
        size: ring.size,
        phase: (ri * 0.9 + i * 0.13) % 1,
        entryOrder: ((i + ring.n / 4) % ring.n) / ring.n,
        seed: ((ri * 37 + i * 11) % 23) / 23,
      });
    }
  });
  return pts;
})();

// ---- motion constants ------------------------------------------------------------

const TAU = Math.PI * 2;
const ENTER_RING_DELAY_S = 0.065;
const ENTER_SWEEP_S = 0.22;
const ENTER_POP_S = 0.78;
const ENTER_SPIN_DELAY_S = 0.12;
// Rotation needs a more legible lag than the quick bead reveal. Keep these separate.
const ENTER_ROTATION_LAG_S = 0.22;
// How far each ring sweeps on entry: a quarter turn, not a full lap (Sep 9) —
// a gentle sweep into place rather than a spin.
export const ENTER_TURNS = 0.25;
const ENTER_SPIN_S = 2.05;
const ENTER_CATCH_AT = 0.88;
const ENTER_OVERSHOOT = 3 / 360;
// The quintic's peak slope is 1.875. Keep speed in rad/s so slowing the sweep also
// reduces its blur, instead of always blurring by the same amount on a longer intro.
const ENTER_PEAK_SPEED = (ENTER_TURNS + ENTER_OVERSHOOT) * 1.875 * TAU / (ENTER_CATCH_AT * ENTER_SPIN_S);
const ENTER_S = (RINGS.length - 1) * ENTER_ROTATION_LAG_S + ENTER_SPIN_DELAY_S + ENTER_SPIN_S;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smootherstep = (p: number) => p * p * p * (p * (p * 6 - 15) + 10);

/** A soft spring-like pop: ease up from zero, swell 12% past full size, then relax.
 *  Zero velocity and acceleration at each join keep the tiny beads from snapping. */
function popIn(progress: number): number {
  const p = clamp01(progress);
  const peakAt = 0.62;
  return p < peakAt
    ? smootherstep(p / peakAt) * 1.12
    : 1 + 0.12 * (1 - smootherstep((p - peakAt) / (1 - peakAt)));
}

/** A quarter clockwise sweep, three degrees past home, then a short catch back.
 *  Both ends have zero velocity; the final offset is exactly zero, so idle never
 *  inherits spin. Starts a quarter lap behind home so the beads sweep forward. */
function entranceTurn(progress: number): number {
  const p = clamp01(progress);
  const turn = p < ENTER_CATCH_AT
    ? smootherstep(p / ENTER_CATCH_AT) * (ENTER_TURNS + ENTER_OVERSHOOT)
    : ENTER_TURNS + ENTER_OVERSHOOT * (1 - smootherstep((p - ENTER_CATCH_AT) / (1 - ENTER_CATCH_AT)));
  return (turn - ENTER_TURNS) * TAU;
}

/** Forward angular velocity; the tiny catch-back is too slow to need blur or swell. */
function entranceSpeed(progress: number): number {
  const p = clamp01(progress / ENTER_CATCH_AT);
  return 16 * p * p * (1 - p) * (1 - p) * ENTER_PEAK_SPEED;
}

// The reference rocks through roughly a quarter turn and back in ~6 seconds. Each
// ring reads the same motion a beat later, including the reversal, so they briefly
// travel in opposite directions as the movement propagates from the centre outward.
const SWAY_CYCLE_S = 5.8;
const SWAY_ARC = Math.PI / 2;
const SWAY_RING_LAG_S = 0.24;
const PULSE_CYCLE_S = 2.35;
const PULSE_RING_LAG_S = 0.18;
const PULSE_HOLD_S = 0.26;
const PULSE_END_S = 1.55;
const PULSE_RADIUS_GAIN = 0.025;

function ringSway(time: number): number {
  return time <= 0 ? 0 : SWAY_ARC * (0.5 - 0.5 * Math.cos(TAU * time / SWAY_CYCLE_S));
}

/** Exact underdamped spring response to a step. Analytical rather than integrated,
 *  so the swell, little compression and recovery are identical at 30/60/120 Hz. */
function springStep(time: number): number {
  if (time <= 0) return 0;
  const frequency = 13;
  const damping = 0.55;
  const damped = Math.sqrt(1 - damping * damping);
  const phase = frequency * damped * time;
  return 1 - Math.exp(-damping * frequency * time) *
    (Math.cos(phase) + damping / damped * Math.sin(phase));
}

/** A short excitation releases into a spring rebound, then a quiet gap before the
 *  next wave. Its tail eases to exact zero; this changes size, never luminance. */
function ringPulse(time: number): number {
  if (time <= 0) return 0;
  const t = time % PULSE_CYCLE_S;
  if (t >= PULSE_END_S) return 0;
  const tail = 1 - smootherstep(clamp01((t - 1.1) / (PULSE_END_S - 1.1)));
  return (springStep(t) - springStep(t - PULSE_HOLD_S)) * tail;
}

const BREATH_CYCLE_S = 2.6;
/** The thinking breath, as bloom (0 = the lattice gathered to a tenth of its radius,
 *  1 = fully open). A narrow band around the listening size (0.62): the lattice
 *  swells and relaxes by a few percent, the beads' surfaces with it. Until Sep 8 it
 *  breathed between 0.25 and 1, which read as dramatic rather than pensive. */
export const BREATH_MIN = 0.58;
export const BREATH_MAX = 0.72;
/** Whether speaking (and the settle) SWIRL the lattice — the whole thing turning one
 *  way, inner rings faster, the voice driving the speed. Off for now (Sep 8): the
 *  agent's voice shows in the outward push instead. The swirl code stays so it can
 *  be turned back on with this one flag. The Sep 9 reference's lagged, back-and-forth
 *  sway is separate from this continuous swirl. */
export const SWIRL = false;
const SWIRL_RIM = 0.9; // rad/s at the rim: a turn every ~7 s at rest, ~3 s when loud
const SWIRL_CENTRE_GAIN = 1.6; // how much faster the centre turns
const SWIRL_TWIST = 0.9; // spiral wind-up, centre relative to rim
const LEVEL_SAMPLES = 72; // ~1.2 s of loudness at 60 fps
const RIPPLE_FRAMES = 7; // per-ring delay: ~0.35 s across the full lattice
const LISTEN_REST = 0.6; // resting brightness while listening — "I hear you", not "off"
const SETTLE_S = 1.25; // beads converging into the sphere
const ENV_INPUT_ATTACK_S = 0.035;
const ENV_OUTPUT_ATTACK_S = 0.08;
const ENV_RELEASE_S = 0.3;
const VOICE_SIZE_GAIN = 0.12;

/** How far the rim moves out at full voice, as a fraction of the lattice width. Bounded
 *  so a ring at full push never reaches the next ring at rest (see lattice.test.ts). */
export const PUSH_MAX = 0.04;
/** The farthest any bead's silhouette reaches from the lattice centre, in any state,
 *  as a fraction of the lattice width: the rim fully bloomed, pulsed and pushed at full
 *  voice, with its beads swollen. Copy laid out under the lattice clears it by sitting
 *  at least this far below the centre (the turn caption does; see Active in
 *  VoiceHero.tsx). Held to the simulation by lattice.test.ts. */
export const LATTICE_REACH = 0.45;
/** The rim travels farther than the inner squares, so the lattice reads as a pressure
 *  wave moving outward rather than every bead shifting the same distance. */
export function pushGain(ring: number): number {
  return 0.4 + 0.6 * ring;
}

/** Per-state gain on what the fast envelope drives. */
const PUSH_GAINS: Record<TurnState, number> = {
  listening: 0.35,
  thinking: 0,
  speaking: 1,
};

// ---- keeping the glass apart ------------------------------------------------------
//
// Size pulses (up to ~1.5× at full voice) grow the beads while the bloom draws the
// rings in faster than it shrinks the beads (0.1 + 0.9b against 0.3 + 0.7b), so at the
// listening size a fully pulsed pill ring, or a square and the pill outside it, could
// overlap (Sep 10 review: "avoid any chance of the glass pieces overlapping at all").
// Rather than retune every gain against every alignment the sway can produce, step()
// ends with a hard, geometry-exact limit: no two silhouettes ever come within
// BEAD_GAP_PX of each other, whatever the state, loudness or frame rate.

/** Every bead's face-on silhouette is a rounded box: a rectangular core (half-extents
 *  per unit of diameter) swept by a disc (radius per unit of diameter). Circles have
 *  no core; pills, lying horizontally as the renderer draws them, a horizontal
 *  segment; squares a 0.7-wide box with 0.15 corners (orbClusterRenderer's glassNormal
 *  does). Pills tilt slowly in the shader, which only foreshortens
 *  them, so the untilted capsule bounds every frame. */
const SILHOUETTES: Record<BeadShape, { cx: number; cy: number; r: number }> = {
  circle: { cx: 0, cy: 0, r: 0.5 },
  pill: { cx: (PILL_ASPECT - 1) / 2, cy: 0, r: 0.5 },
  square: { cx: 0.35, cy: 0.35, r: 0.15 },
};
/** Clear field that must remain between any two silhouettes, in CSS pixels. The shader
 *  antialiases half a pixel past each edge; two pixels leaves a visible sliver of field
 *  between beads that are as close as they ever get. */
export const BEAD_GAP_PX = 2;
/** Where the limit starts to lean on a pair: once they have used this fraction of the
 *  room between them, further growth is compressed toward the limit rather than
 *  stopped at it, so a pulse that would touch its neighbour rounds off instead of
 *  hitting a wall. Below it the limiter is inert and the choreography is untouched. */
const BEAD_GAP_KNEE = 0.9;

/** Smallest positive root of A f² + B f + C = 0, or null. */
function smallestPositiveRoot(A: number, B: number, C: number): number | null {
  if (Math.abs(A) < 1e-12) {
    if (Math.abs(B) < 1e-12) return null;
    const f = -C / B;
    return f > 0 ? f : null;
  }
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const r1 = (-B - s) / (2 * A);
  const r2 = (-B + s) / (2 * A);
  const lo = Math.min(r1, r2);
  const hi = Math.max(r1, r2);
  return lo > 0 ? lo : hi > 0 ? hi : null;
}

/** The largest common factor both beads' sizes could be multiplied by before their
 *  silhouettes come within `gap` of each other along their present offset. Exact for
 *  these shapes: the Minkowski sum of two rounded boxes is a rounded box whose core
 *  and radius are the sums, and the pair is clear when the centre offset lies at least
 *  `gap` outside it. That holds when the offset clears the sum's x edge, or its y
 *  edge, or its corner disc — three monotone conditions in the factor, so the answer
 *  is the largest of their three thresholds. Infinity when the pair can grow without
 *  limit (only possible when both are zero-sized); 0 or less when the centres
 *  themselves are within the gap. */
export function beadClearance(a: BeadPose, b: BeadPose, gap = BEAD_GAP_PX): number {
  const sa = SILHOUETTES[a.shape];
  const sb = SILHOUETTES[b.shape];
  const cx = sa.cx * a.size + sb.cx * b.size;
  const cy = sa.cy * a.size + sb.cy * b.size;
  const r = sa.r * a.size + sb.r * b.size;
  if (cx + cy + r <= 0) return Infinity;
  const ox = Math.abs(b.x - a.x);
  const oy = Math.abs(b.y - a.y);
  // Clear of the x edge: ox − f·cx ≥ gap + f·r. Likewise the y edge.
  let f = Math.max((ox - gap) / (cx + r), (oy - gap) / (cy + r));
  // Clear of the corner: hypot(ox − f·cx, oy − f·cy) ≥ gap + f·r, valid while both
  // components are non-negative (otherwise an edge condition already covers it).
  const root = smallestPositiveRoot(
    cx * cx + cy * cy - r * r,
    -2 * (ox * cx + oy * cy + gap * r),
    ox * ox + oy * oy - gap * gap,
  );
  if (root !== null && ox - root * cx >= 0 && oy - root * cy >= 0) f = Math.max(f, root);
  return f;
}

/** Shrink whatever beads must shrink so that no two silhouettes come within
 *  BEAD_GAP_PX. Each pair yields a common factor ≤ 1 for both of its beads; a bead
 *  takes the smallest across its pairs. Both members of a pair then scale by at most
 *  the pair's factor, so one pass suffices: the sum silhouette shrinks at least as
 *  much as the factor asked for. Continuous in every input (a minimum of continuous
 *  functions), so nothing snaps when the limit engages or lets go. */
function keepBeadsApart(poses: BeadPose[], scale: Float64Array): void {
  const n = poses.length;
  for (let i = 0; i < n; i++) scale[i] = 1;
  for (let i = 0; i < n; i++) {
    const a = poses[i];
    if (a.size <= 0) continue;
    for (let j = i + 1; j < n; j++) {
      const b = poses[j];
      if (b.size <= 0) continue;
      const clearance = beadClearance(a, b);
      let k: number;
      if (clearance <= 0) {
        k = 0;
      } else {
        // How much of the room this pair has used: 1 is touching (with the gap).
        const used = 1 / clearance;
        if (used <= BEAD_GAP_KNEE) continue;
        // Ease from the knee toward, but never onto, the limit.
        const soft = 1 - (1 - BEAD_GAP_KNEE) * Math.exp(-(used - BEAD_GAP_KNEE) / (1 - BEAD_GAP_KNEE));
        k = soft / used;
      }
      if (k < scale[i]) scale[i] = k;
      if (k < scale[j]) scale[j] = k;
    }
  }
  for (let i = 0; i < n; i++) if (scale[i] < 1) poses[i].size *= scale[i];
}

/** Where the lattice sits this frame, in CSS pixels of the hero. `w` is the lattice
 *  scale (the width the conversation screen gave it). `target` is the sphere to
 *  settle into. */
export interface Frame {
  cx: number;
  cy: number;
  w: number;
  target?: { x: number; y: number; r: number };
}

/** One bead, this frame, in CSS pixels of the hero. */
export interface BeadPose {
  shape: BeadShape;
  ri: number;
  ring: number;
  x: number;
  y: number;
  /** diameter (short axis for a pill) */
  size: number;
  /** the bead's bearing from the centre, after any spin */
  angle: number;
  /** 0..1, including the entrance and settle fades */
  alpha: number;
  /** entrance/settle visibility only, independent of the glass body's opacity */
  rimAlpha: number;
  /** 0..1 brightness */
  glow: number;
  /** 0..1 frost in the glass body: clear on entry, gently filling with the size wave */
  fill: number;
  /** 0..1 rim light: dark while the bead arrives, fully on at rest, dying first
   *  on settle so the highlights go out before the glass fades */
  lamp: number;
  seed: number;
}

export interface Ramp2 {
  sky: string;
  mid: string;
}

export type LatticeState = TurnState | "settling" | "hidden";
export type PulseDirection = "inward" | "outward";

const NEUTRAL_RAMP: Ramp2 = { sky: "#F7F2EA", mid: "#A855F7" };

// ---- the lattice -----------------------------------------------------------------

export class Lattice {
  private state: LatticeState = "listening";
  private t = 0;
  private enterT = 0;
  private entryBlur = 0;
  private settleT = 0;
  /** Fires once when the beads have fully converged and the lattice hides itself. */
  onSettled: (() => void) | null = null;
  /** The family the conversation is leaning toward; the renderer tints by it. */
  ramp: Ramp2 = NEUTRAL_RAMP;
  /** Where to draw. Set by the component each frame; read by step(). */
  frame: Frame | null = null;

  // Brightness input, low-passed (see the header), and its history for the ripple.
  private glowLevel = 0;
  private glowHist: number[] = [];
  // Shape and position input, fast envelope, and its history for the radiating push.
  private env = 0;
  private envHist: number[] = [];
  private levelDirection: PulseDirection = "inward";

  // eased animation state
  private spin = 0;
  private swirl = 0;
  private bloom = 0.6;
  private glow = 1;
  private breathT = 0;
  // Shared follow-through, independent of whose turn it is. Pauses for reduced motion
  // and the reveal, so neither preference changes nor turn changes restart the wave.
  private motionT = 0;
  private ringTurn: number[] = RINGS.map(() => 0);
  private ringPulse: number[] = RINGS.map(() => 0);
  private pulseGain = 0.15;
  /** Scratch for keepBeadsApart, one factor per bead. */
  private sizeLimit = new Float64Array(LATTICE.length);

  private reduced: boolean;

  constructor(reduced = false) {
    this.reduced = reduced;
  }

  /** Speed-linked softness for the glass canvas only, in CSS pixels. Zero at rest. */
  get entranceBlur(): number {
    return this.entryBlur;
  }

  get reducedMotion(): boolean {
    return this.reduced;
  }

  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
    if (reduced) {
      // Skip the flourish immediately, including a preference change mid-entry.
      // Turning motion back on must not replay it in the middle of a conversation.
      this.enterT = ENTER_S;
      this.entryBlur = 0;
      this.ringPulse.fill(0);
      this.pulseGain = 0;
    }
  }

  setState(state: TurnState): void {
    if (this.state === "settling" || this.state === "hidden") return;
    this.state = state;
  }

  /** Begin the reveal: beads converge into the Frame's target over ~1.25 s. */
  settle(): void {
    if (this.state === "settling" || this.state === "hidden") return;
    this.state = "settling";
    this.settleT = 0;
  }

  isHidden(): boolean {
    return this.state === "hidden";
  }

  currentState(): LatticeState {
    return this.state;
  }

  setRamp(ramp: Ramp2): void {
    this.ramp = ramp;
  }

  setFrame(frame: Frame): void {
    this.frame = frame;
  }

  /** One loudness sample per frame, 0..1 — whichever side is talking. `dt` is the time
   *  since the previous sample; defaults to a 60 Hz frame. */
  pushLevel(v: number, dt = 1 / 60, direction?: PulseDirection): void {
    const d = Math.min(0.05, Math.max(0, dt));
    const lvl = Math.min(1, Math.max(0, v));
    this.levelDirection = direction ?? (this.state === "speaking" ? "outward" : "inward");
    this.glowLevel += (lvl - this.glowLevel) * Math.min(1, d * 9);
    this.glowHist.push(this.glowLevel);
    if (this.glowHist.length > LEVEL_SAMPLES) this.glowHist.shift();
    const attack = this.levelDirection === "inward" ? ENV_INPUT_ATTACK_S : ENV_OUTPUT_ATTACK_S;
    const tau = lvl > this.env ? attack : ENV_RELEASE_S;
    this.env += (lvl - this.env) * Math.min(1, d / tau);
    this.envHist.push(this.env);
    if (this.envHist.length > LEVEL_SAMPLES) this.envHist.shift();
  }

  /** The fast envelope as of the last sample. */
  envelope(): number {
    return this.env;
  }

  /** Back to neutral for a new conversation; replay the entrance on its first frame. */
  reset(): void {
    this.state = "listening";
    this.t = 0;
    this.enterT = 0;
    this.entryBlur = 0;
    this.settleT = 0;
    this.ramp = NEUTRAL_RAMP;
    this.frame = null;
    this.glowLevel = 0;
    this.glowHist = [];
    this.env = 0;
    this.envHist = [];
    this.levelDirection = "inward";
    this.spin = 0;
    this.swirl = 0;
    this.bloom = 0.6;
    this.glow = 1;
    this.breathT = 0;
    this.motionT = 0;
    this.ringTurn = RINGS.map(() => 0);
    this.ringPulse = RINGS.map(() => 0);
    this.pulseGain = 0.15;
  }

  /** Advance by dt seconds and return every bead's pose. Empty once hidden, or when
   *  the component has not yet said where the lattice sits. */
  step(dtRaw: number, frame: Frame | null = this.frame, reuse?: BeadPose[]): BeadPose[] {
    if (this.state === "hidden" || !frame) {
      if (reuse) reuse.length = 0;
      return reuse ?? [];
    }
    const dt = Math.min(0.05, Math.max(0, dtRaw));
    this.t += dt;
    const ease = (k: number) => Math.min(1, dt * k);
    const { reduced } = this;
    const state = this.state;
    const w = Math.max(1, frame.w);

    // This clock only runs when the renderer has a real frame to draw: loading the
    // lazy WebGL bundle or waiting for microphone permission cannot eat the entrance.
    // If a reveal interrupts it, hold its transforms while the beads converge.
    if (reduced) this.enterT = ENTER_S;
    else if (state !== "settling") this.enterT = Math.min(ENTER_S, this.enterT + dt);
    const entering = !reduced && this.enterT < ENTER_S;
    const entryRings = entering
      ? RINGS.map((_, ri) => {
        const p = (this.enterT - ri * ENTER_ROTATION_LAG_S - ENTER_SPIN_DELAY_S) / ENTER_SPIN_S;
        const speed = entranceSpeed(p);
        return { angle: entranceTurn(p), speed, swell: 1 + 0.06 * speed / ENTER_PEAK_SPEED };
      })
      : null;
    const speed = entryRings && state !== "settling" ? Math.max(...entryRings.map((r) => r.speed)) : 0;
    // Relative to the sweep's own peak, so a gentler intro still softens a touch at
    // its fastest point and is crisp at both slow ends.
    this.entryBlur = 0.7 * Math.min(1, w / 560) * smootherstep(clamp01((speed - 0.35 * ENTER_PEAK_SPEED) / (0.65 * ENTER_PEAK_SPEED)));

    // Two readings of loudness: smoothed for size and speed, instantaneous for the blink.
    const buf = this.glowHist;
    let level = 0;
    const tailStart = Math.max(0, buf.length - 12);
    const tailLength = buf.length - tailStart;
    for (let i = tailStart; i < buf.length; i++) level += buf[i] * ((i - tailStart + 1) / tailLength);
    level = tailLength ? Math.min(1, level / (tailLength / 2)) : 0;
    const fast = buf.length ? Math.min(1, buf[buf.length - 1] * 1.4) : 0;

    // Settle progress, 0..1, eased. Position, size and alpha all key off it below.
    let settle = 0;
    if (state === "settling" && frame.target) {
      this.settleT += dt;
      const p = Math.min(1, this.settleT / SETTLE_S);
      settle = p * p * (3 - 2 * p);
      if (p >= 1) {
        this.state = "hidden";
        this.onSettled?.();
        if (reuse) reuse.length = 0;
        return reuse ?? [];
      }
    }

    let bloomTarget: number;
    let glowTarget: number;
    let swirlTarget: number;
    let cyc = 0;
    const turning = SWIRL && !reduced;
    if (state === "settling") {
      // React may need a frame to lay out the reveal sphere. Hold the live pose until
      // its measured target exists so the first visible settle frame cannot jump.
      if (frame.target && turning) this.spin += dt * SWIRL_RIM * (0.8 + settle * 2.5);
      bloomTarget = frame.target ? 0.85 : this.bloom;
      glowTarget = frame.target ? 1 : this.glow;
      swirlTarget = frame.target && turning ? 1 : 0;
    } else if (state === "thinking") {
      // A raised cosine so it eases at both ends rather than bouncing.
      this.breathT += dt;
      cyc = 0.5 - 0.5 * Math.cos((this.breathT / BREATH_CYCLE_S) * Math.PI * 2);
      if (reduced) {
        bloomTarget = 0.62;
        glowTarget = 0.7 + 0.15 * cyc;
      } else {
        bloomTarget = BREATH_MIN + cyc * (BREATH_MAX - BREATH_MIN);
        glowTarget = 0.72 + cyc * 0.18;
      }
      swirlTarget = 0;
    } else if (state === "speaking") {
      if (turning) this.spin += dt * SWIRL_RIM * (0.7 + level * 1.6);
      bloomTarget = 0.72 + level * 0.28;
      glowTarget = 0.85 + level * 0.15;
      swirlTarget = turning ? 1 : 0;
    } else {
      // Input moves as a directional ring wave below. Expanding the whole lattice from
      // the same sample would mask the outer-to-inner travel with simultaneous motion.
      bloomTarget = 0.62;
      glowTarget = LISTEN_REST + fast * (1 - LISTEN_REST);
      swirlTarget = 0;
    }
    this.bloom += (bloomTarget - this.bloom) * ease(4);
    this.glow += (glowTarget - this.glow) * ease(state === "listening" ? 18 : 5);
    this.swirl += (swirlTarget - this.swirl) * ease(2.5);
    if (state !== "thinking") this.breathT = 0;

    // Hand off from the entrance into a shared, slow sway and spring pulse. Use a
    // separate pausable clock, and seconds-based delays (not frames). The first
    // outward wave starts once the entrance finishes. State changes never reset it.
    if (!reduced && state !== "settling") {
      this.motionT += Math.min(dt, Math.max(0, this.t - ENTER_S));
      const pulseTarget = state === "thinking" ? 0 : 0.15 + this.env * 0.18;
      this.pulseGain += (pulseTarget - this.pulseGain) * (1 - Math.exp(-dt / 0.35));
      for (let ri = 0; ri < RINGS.length; ri++) {
        this.ringTurn[ri] = ringSway(this.motionT - ri * SWAY_RING_LAG_S);
        const pulseOrder = state === "listening" ? RINGS.length - 1 - ri : ri;
        this.ringPulse[ri] = ringPulse(this.motionT - pulseOrder * PULSE_RING_LAG_S);
      }
    }

    const { bloom, glow, swirl, spin } = this;
    const pushGainForState = state === "settling" ? 0 : PUSH_GAINS[state];

    // Agent output travels centre → rim; visitor input travels rim → centre. Reduced
    // motion removes the directional delay so the whole lattice shares one reading.
    const delayed = (hist: number[], ri: number) => {
      const ringDelay = this.levelDirection === "inward" ? RINGS.length - 1 - ri : ri;
      const back = reduced ? 0 : ringDelay * RIPPLE_FRAMES;
      const idx = hist.length - 1 - back;
      return idx >= 0 && idx < hist.length ? hist[idx] : 0;
    };
    // Where the beads gather on settle: the sphere, or the lattice centre if unknown.
    const tx = frame.target?.x ?? frame.cx;
    const ty = frame.target?.y ?? frame.cy;
    const tr = frame.target?.r ?? w * 0.2;

    const poses = reuse ?? [];
    let poseIndex = 0;
    for (const pt of LATTICE) {
      const wobble = reduced ? 0 : Math.sin(this.t * 0.9 + pt.phase * 6.28) * 0.04;
      const b = Math.max(0, Math.min(1, bloom + wobble));
      const voice = delayed(this.envHist, pt.ri);
      const push = reduced
        ? 0
        : PUSH_MAX * w * pushGain(pt.ring) * pushGainForState * voice * (1 - settle);
      const pulse = reduced ? 0 : this.ringPulse[pt.ri] * (1 - settle);
      const radius = pt.base * w * (0.1 + b * 0.9) * (1 + pulse * PULSE_RADIUS_GAIN) + push;
      const gain = 1 + (1 - pt.ring) * SWIRL_CENTRE_GAIN;
      const a = pt.angle + (entryRings?.[pt.ri].angle ?? 0) + this.ringTurn[pt.ri] + spin * gain + swirl * SWIRL_TWIST * (1 - pt.ring) * (1 - b);
      let x = frame.cx + Math.cos(a) * radius;
      let y = frame.cy + Math.sin(a) * radius;

      const ripple = state === "listening" ? Math.min(1, delayed(this.glowHist, pt.ri) * 1.4) : 0;
      // A coherent size wave per ring, with a smaller radial follow-through. Voice
      // also swells the currently active ring, using the same directional delay as
      // brightness and push, so live mic/TTS levels do not merely modulate the loop.
      let size = w * pt.size * (0.3 + b * 0.7) * (1 + pulse * this.pulseGain + voice * VOICE_SIZE_GAIN);
      const g = state === "listening" ? LISTEN_REST + ripple * (1 - LISTEN_REST) : glow;
      let alpha = 0.55 + 0.45 * Math.pow(b, 1.2);
      let rimAlpha = 1;
      let fill = 0.12 + 0.35 * Math.max(clamp01(pulse), voice);
      let lamp = 1;

      if (entering) {
        const delay = pt.ri * ENTER_RING_DELAY_S + pt.entryOrder * ENTER_SWEEP_S;
        const scale = popIn((this.enterT - delay) / ENTER_POP_S);
        size *= scale * (entryRings?.[pt.ri].swell ?? 1);
        alpha *= Math.min(1, scale * 4);
        rimAlpha *= Math.min(1, scale * 4);
        // The rim arrives first; the soft frost — and the light inside — develops
        // after the bead is visible.
        fill *= smootherstep(clamp01((this.enterT - delay - 0.3) / 0.6));
        lamp = smootherstep(clamp01((this.enterT - delay - 0.3) / 0.6));
      }

      if (settle > 0) {
        // Fall inward along the spiral: outer rings leave later, so the lattice folds
        // from the centre out rather than collapsing as one; each bead fades as it
        // meets the sphere's edge. The inner light dies first, ahead of the bead's
        // own convergence, so the lights go out before the glass fades.
        const lead = Math.max(0, Math.min(1, (settle - pt.ring * 0.25) / 0.75));
        const e = lead * lead * (3 - 2 * lead);
        const lightLead = Math.max(0, Math.min(1, (settle - pt.ring * 0.25) / 0.35));
        lamp *= 1 - smootherstep(lightLead);
        x = x + (tx - x) * e;
        y = y + (ty - y) * e;
        size = size * (1 - e * 0.55);
        alpha = alpha * (1 - Math.max(0, (e - 0.55) / 0.45));
        rimAlpha *= 1 - Math.max(0, (e - 0.55) / 0.45);
        // arrive at the rim of the sphere, not its centre
        const dx = x - tx;
        const dy = y - ty;
        const d = Math.hypot(dx, dy);
        if (d > 0 && d < tr * 0.9 && e < 1) {
          x = tx + (dx / d) * tr * 0.9;
          y = ty + (dy / d) * tr * 0.9;
        }
      }

      const pose = poses[poseIndex] ?? {} as BeadPose;
      pose.shape = pt.shape;
      pose.ri = pt.ri;
      pose.ring = pt.ring;
      pose.x = x;
      pose.y = y;
      pose.size = size;
      pose.angle = a;
      pose.alpha = alpha;
      pose.rimAlpha = rimAlpha;
      pose.glow = g;
      pose.fill = fill;
      pose.lamp = lamp;
      pose.seed = pt.seed;
      poses[poseIndex++] = pose;
    }
    poses.length = poseIndex;
    // Last word on size: the glass never overlaps (see "keeping the glass apart").
    keepBeadsApart(poses, this.sizeLimit);
    return poses;
  }
}
