import { cityOf, roadsIn } from "@/lib/claim";

/**
 * A drawing of where it happened, from the road names in the location.
 * No coordinates reach the browser, so this is a sketch, not a map.
 */
export function StylizedMap({ address }: { address: string }) {
  const roads = roadsIn(address);
  const city = cityOf(address);
  return (
    <svg
      viewBox="0 0 300 210"
      className="h-auto w-full rounded-2xl bg-[#f1eee9]"
      role="img"
      aria-label={roads.length ? `Sketch of ${roads.join(" and ")}` : "Sketch of the location"}
    >
      <defs>
        <pattern id="map-grid" width="30" height="30" patternUnits="userSpaceOnUse">
          <path d="M30 0H0V30" fill="none" stroke="#e2ded7" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="300" height="210" fill="url(#map-grid)" />
      {roads.length === 0 && (
        <g fill="#e6e1d9">
          <rect x="40" y="40" width="90" height="56" rx="4" />
          <rect x="170" y="40" width="90" height="56" rx="4" />
          <rect x="40" y="120" width="220" height="50" rx="4" />
        </g>
      )}
      {roads[0] && (
        <>
          <path d="M-10 150 L310 96" stroke="#fff" strokeWidth="16" />
          <text x="18" y="132" transform="rotate(-9.6 18 132)" className="fill-[#6b6862] font-mono text-[9px] tracking-[0.14em] uppercase">
            {roads[0]}
          </text>
        </>
      )}
      {roads[1] && (
        <>
          <path d="M150 -10 L132 220" stroke="#fff" strokeWidth="14" />
          <text x="166" y="36" className="fill-[#6b6862] font-mono text-[9px] tracking-[0.14em] uppercase">
            {roads[1]}
          </text>
        </>
      )}
      {city && (
        <text x="288" y="198" textAnchor="end" className="fill-[#8a857d] font-mono text-[9px] tracking-[0.14em] uppercase">
          {city}
        </text>
      )}
      <g transform={`translate(${roads[1] ? 140 : 150} ${roads[0] ? 113 : 105})`}>
        <path d="M0 0 C-12 -16 -14 -22 -14 -28 a14 14 0 0 1 28 0 c0 6 -2 12 -14 28Z" fill="#d946ef" stroke="#a21caf" strokeWidth="1" />
        <circle cx="0" cy="-28" r="5" fill="#1c1b1a" />
      </g>
    </svg>
  );
}
