/** How long a change of persona takes to arrive, everywhere it shows: the backdrop's
 *  profile, and the ring's glass tint riding on top of it. One number so the two move
 *  as one field rather than the ring snapping ahead of the ground it sits on. */
export const PERSONA_TRANSITION_MS = 3_000;

/** The ease both use across that window. */
export const easeInOutCubic = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;

/** How far a transition that began at `startedAt` has run by `now`, as 0..1.
 *
 *  Clamped at BOTH ends, and the lower clamp is the one that matters. The canvas is
 *  painted from two clocks: a requestAnimationFrame callback is handed the frame's
 *  START time, while an on-demand repaint (a persona change, a resize) passes
 *  `performance.now()`, read mid-frame and therefore LATER. So the repaint that opens a
 *  transition can stamp it a few milliseconds ahead of the next frame's timestamp, and
 *  `now - startedAt` comes out negative.
 *
 *  Unclamped that is not a rounding curiosity: easeInOutCubic is 4t³ below 0.5, so a
 *  progress of -0.0011 eases to -5.3e-9 and every interpolated setting lands just
 *  OUTSIDE the range it is travelling between. Seen Oct 6 2026, a live crash: the only
 *  persona with a non-zero gradient start (Anchor, tintStart 0.35) was interpolated to
 *  -1.86e-9, and `addColorStop` rejects anything outside 0..1, so the whole backdrop
 *  threw (IndexSizeError) the moment the aura leaned Anchor. A 3.3 ms skew across a
 *  3 s transition. */
export function transitionProgress(now: number, startedAt: number, durationMs: number): number {
  if (!(durationMs > 0)) return 1;
  const p = (now - startedAt) / durationMs;
  return p > 1 ? 1 : p > 0 ? p : 0;
}
