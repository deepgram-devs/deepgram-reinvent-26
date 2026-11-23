"use client";

import { useId } from "react";

/**
 * A drawing of a place from its road names, with a magenta pin: a sketch, not a map. Use it when
 * the record has an address but no coordinates reach the browser (and no map API is worth it
 * for an app). One road crosses diagonally, a second runs down; with none, it draws blocks.
 */
export function SketchMap({ roads = [], city, label }: { roads?: string[]; city?: string; label?: string }) {
  const grid = useId();
  const name = label ?? (roads.length ? `Sketch of ${roads.join(" and ")}` : "Sketch of the location");
  return (
    <svg viewBox="0 0 300 210" className="h-auto w-full rounded-2xl bg-(--map-ground)" role="img" aria-label={name}>
      <defs>
        <pattern id={grid} width="30" height="30" patternUnits="userSpaceOnUse">
          <path d="M30 0H0V30" fill="none" stroke="var(--map-grid)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="300" height="210" fill={`url(#${grid})`} />
      {roads.length === 0 && (
        <g fill="var(--map-block)">
          <rect x="40" y="40" width="90" height="56" rx="4" />
          <rect x="170" y="40" width="90" height="56" rx="4" />
          <rect x="40" y="120" width="220" height="50" rx="4" />
        </g>
      )}
      {roads[0] && (
        <>
          <path d="M-10 150 L310 96" stroke="var(--map-road)" strokeWidth="16" />
          <text x="18" y="132" transform="rotate(-9.6 18 132)" className="fill-(--map-label) text-[9px] tracking-[0.14em] uppercase">
            {roads[0]}
          </text>
        </>
      )}
      {roads[1] && (
        <>
          <path d="M150 -10 L132 220" stroke="var(--map-road)" strokeWidth="14" />
          <text x="166" y="36" className="fill-(--map-label) text-[9px] tracking-[0.14em] uppercase">
            {roads[1]}
          </text>
        </>
      )}
      {city && (
        <text x="288" y="198" textAnchor="end" className="fill-(--map-city) text-[9px] tracking-[0.14em] uppercase">
          {city}
        </text>
      )}
      <g transform={`translate(${roads[1] ? 140 : 150} ${roads[0] ? 113 : 105})`}>
        <path d="M0 0 C-12 -16 -14 -22 -14 -28 a14 14 0 0 1 28 0 c0 6 -2 12 -14 28Z" fill="#e042ff" stroke="#a21caf" strokeWidth="1" />
        <circle cx="0" cy="-28" r="5" fill="#1d1d1d" />
      </g>
    </svg>
  );
}
