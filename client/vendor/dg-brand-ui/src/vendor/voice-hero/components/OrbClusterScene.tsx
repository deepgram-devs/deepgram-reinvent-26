"use client";

import { useEffect, useRef } from "react";
import { OrbClusterRenderer, type RingBackdropSource } from "../lib/orbClusterRenderer";
import type { Lattice } from "../lib/lattice";

export type { RingBackdropSource } from "../lib/orbClusterRenderer";

export interface OrbClusterSceneProps {
  lattice: Lattice;
  getBackdrop?: () => RingBackdropSource | null;
  paused?: boolean;
  auraTextureEnabled?: boolean;
  frostEnabled?: boolean;
  domBackdropsEnabled?: boolean;
}

export default function OrbClusterScene({
  lattice,
  getBackdrop,
  paused = false,
  auraTextureEnabled = true,
  frostEnabled = true,
  domBackdropsEnabled = true,
}: OrbClusterSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<OrbClusterRenderer>(null);
  const pausedRef = useRef(paused);
  const restartLoopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new OrbClusterRenderer(host, lattice, {
      getBackdrop,
      auraTextureEnabled,
      frostEnabled,
      domBackdropsEnabled,
    });
    rendererRef.current = renderer;
    const resizeObserver = new ResizeObserver(([entry]) => {
      renderer.resize(entry.contentRect.width, entry.contentRect.height);
    });
    resizeObserver.observe(host);

    let frame = 0;
    let lastTime = performance.now();
    let disposed = false;
    const tick = (time: number) => {
      if (disposed || pausedRef.current) return;
      renderer.render((time - lastTime) / 1000);
      if (disposed || pausedRef.current) return;
      lastTime = time;
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      cancelAnimationFrame(frame);
      if (disposed || pausedRef.current) return;
      lastTime = performance.now();
      renderer.resume();
      frame = requestAnimationFrame(tick);
    };
    start();

    restartLoopRef.current = start;
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      renderer.dispose();
      rendererRef.current = null;
      restartLoopRef.current = null;
    };
  }, [lattice]);

  useEffect(() => {
    rendererRef.current?.updateOptions({ getBackdrop, auraTextureEnabled, frostEnabled, domBackdropsEnabled });
  }, [getBackdrop, auraTextureEnabled, frostEnabled, domBackdropsEnabled]);

  useEffect(() => {
    pausedRef.current = paused;
    restartLoopRef.current?.();
  }, [paused]);

  return <div ref={hostRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />;
}
