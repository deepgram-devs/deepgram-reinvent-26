"use client";

import {
  lazy,
  Suspense,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Lattice, type LatticeState, type Ramp2 } from "../lib/lattice";
import type { RingBackdropSource } from "../lib/orbClusterRenderer";

const OrbClusterScene = lazy(() => import("./OrbClusterScene"));

export type ForegroundRingHandle = Lattice;

export interface ForegroundRingProps {
  active?: boolean;
  /** Slow-changing choreography state. Audio amplitude should use audioLevel instead. */
  state?: Exclude<LatticeState, "hidden">;
  /** Two colours used to tint the glass when the ring is not driven imperatively. */
  palette?: Ramp2;
  /** Mutable 0..1 amplitude, sampled without causing React renders. */
  audioLevel?: RefObject<number>;
  /** Optional canvas sampled by the glass shader. Omit it over a host-owned background. */
  getBackdrop?: () => RingBackdropSource | null;
  /** Centre and size the ring inside its own box. Disable when setFrame is driven through the handle. */
  autoFrame?: boolean;
  maxSize?: number;
  visible?: boolean;
  auraTextureEnabled?: boolean;
  frostEnabled?: boolean;
  domBackdropsEnabled?: boolean;
  onSettled?: () => void;
}

/** The reusable voice-reactive ring layer rendered over a HeroBackground. */
const ForegroundRing = forwardRef<ForegroundRingHandle, ForegroundRingProps>(
  function ForegroundRing(
    {
      active = true,
      state,
      palette,
      audioLevel,
      getBackdrop,
      autoFrame = true,
      maxSize = 560,
      visible = true,
      auraTextureEnabled = true,
      frostEnabled = true,
      domBackdropsEnabled = true,
      onSettled,
    },
    ref,
  ) {
    const [lattice] = useState(() => new Lattice(false));
    const rootRef = useRef<HTMLDivElement>(null);
    const paletteRef = useRef(palette);
    paletteRef.current = palette;
    const onSettledRef = useRef(onSettled);
    onSettledRef.current = onSettled;
    useImperativeHandle(ref, () => lattice, [lattice]);

    useEffect(() => {
      lattice.onSettled = () => onSettledRef.current?.();
      const motion = typeof matchMedia === "function"
        ? matchMedia("(prefers-reduced-motion: reduce)")
        : null;
      const onMotionChange = () => lattice.setReducedMotion(motion?.matches ?? false);
      onMotionChange();
      motion?.addEventListener("change", onMotionChange);
      return () => {
        motion?.removeEventListener("change", onMotionChange);
        lattice.onSettled = null;
      };
    }, [lattice]);

    useEffect(() => {
      if (!active || !state) return;
      if (state === "settling") {
        lattice.settle();
        return;
      }
      if (lattice.currentState() === "settling" || lattice.isHidden()) {
        lattice.reset();
        if (paletteRef.current) lattice.setRamp(paletteRef.current);
      }
      lattice.setState(state);
    }, [active, lattice, state]);

    useEffect(() => {
      if (palette) lattice.setRamp(palette);
    }, [lattice, palette]);

    useEffect(() => {
      const element = rootRef.current;
      if (!autoFrame || !element) return;
      const place = () => {
        const { width, height } = element.getBoundingClientRect();
        lattice.setFrame({
          cx: width / 2,
          cy: height / 2,
          // `w` is the lattice's design scale, not its rendered diameter. At maximum
          // bloom the bead silhouettes occupy about 90% of it.
          w: Math.max(0, Math.min(maxSize, width / 0.9, height / 0.9)),
          target: state === "settling" ? { x: width / 2, y: height / 2, r: 0 } : undefined,
        });
      };
      place();
      const resize = new ResizeObserver(place);
      resize.observe(element);
      return () => resize.disconnect();
    }, [autoFrame, lattice, maxSize, state]);

    useEffect(() => {
      if (!active || !visible || !audioLevel) return;
      let frame = 0;
      let last = performance.now();
      const sample = (now: number) => {
        lattice.pushLevel(audioLevel.current, (now - last) / 1000);
        last = now;
        frame = requestAnimationFrame(sample);
      };
      frame = requestAnimationFrame(sample);
      return () => cancelAnimationFrame(frame);
    }, [active, audioLevel, lattice, visible]);

    return (
      <div
        ref={rootRef}
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }}
      >
        {active && (
          <Suspense fallback={null}>
            <OrbClusterScene
              lattice={lattice}
              getBackdrop={getBackdrop}
              paused={!visible}
              auraTextureEnabled={auraTextureEnabled}
              frostEnabled={frostEnabled}
              domBackdropsEnabled={domBackdropsEnabled}
            />
          </Suspense>
        )}
      </div>
    );
  },
);

export default ForegroundRing;
