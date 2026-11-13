// A top-down sedan, front to the left. The car faces left, so its left
// (driver's) side is at the bottom and the passenger's side is at the top.

const EXTERIOR: Record<string, [number, number]> = {
  Front: [16, 80],
  "Driver Front": [64, 136],
  "Passenger Front": [64, 24],
  Hood: [62, 80],
  Windshield: [112, 80],
  Roof: [172, 80],
  "Rear Window": [236, 80],
  "Driver Side": [172, 138],
  "Passenger Side": [172, 22],
  "Driver Rear": [272, 136],
  Rear: [306, 80],
  "Passenger Rear": [272, 24],
};

const INTERIOR: Record<string, [number, number]> = {
  Dashboard: [104, 80],
  Airbags: [104, 46],
  "Ignition/Steering Column": [112, 116],
  "Front Seats": [156, 80],
  "Rear Seats": [222, 80],
  Headliner: [190, 40],
};

export const AREA_NAMES = { exterior: Object.keys(EXTERIOR), interior: Object.keys(INTERIOR) };

function Body() {
  return (
    <g fill="none" stroke="#3a3835" strokeWidth="1.5">
      <path d="M50 14 H280 Q312 14 314 46 V114 Q312 146 280 146 H50 Q8 146 8 104 V56 Q8 14 50 14Z" fill="#fff" />
      <path d="M92 30 Q84 80 92 130 L134 124 Q128 80 134 36Z" />
      <rect x="140" y="34" width="68" height="92" rx="6" />
      <path d="M216 36 L250 40 Q256 80 250 120 L216 124Z" />
      <path d="M100 14 L96 6 M100 146 L96 154" strokeLinecap="round" />
    </g>
  );
}

function Cabin() {
  return (
    <g fill="none" stroke="#3a3835" strokeWidth="1.5">
      <path d="M50 14 H280 Q312 14 314 46 V114 Q312 146 280 146 H50 Q8 146 8 104 V56 Q8 14 50 14Z" fill="#fff" />
      <rect x="84" y="24" width="190" height="112" rx="12" strokeDasharray="4 4" />
      <rect x="94" y="30" width="18" height="100" rx="5" />
      <circle cx="122" cy="112" r="12" />
      <rect x="140" y="34" width="36" height="38" rx="7" />
      <rect x="140" y="88" width="36" height="38" rx="7" />
      <rect x="200" y="34" width="44" height="92" rx="8" />
    </g>
  );
}

/** `label` says what's damaged, in the UI's language, for screen readers */
export function CarDiagram({ view, damaged, label }: { view: "exterior" | "interior"; damaged: string[]; label: string }) {
  const spots = view === "exterior" ? EXTERIOR : INTERIOR;
  return (
    <svg viewBox="0 0 322 160" className="h-auto w-full" role="img" aria-label={label}>
      {view === "exterior" ? <Body /> : <Cabin />}
      {Object.entries(spots).map(([name, [x, y]]) => {
        const hit = damaged.includes(name);
        return (
          <g key={name}>
            <title>{name}</title>
            {hit && <circle cx={x} cy={y} r="11" fill="#ef4444" opacity="0.2" />}
            <circle
              cx={x}
              cy={y}
              r={hit ? 6.5 : 3}
              fill={hit ? "#ef4444" : "#d6d2cb"}
              stroke={hit ? "#fff" : "none"}
              strokeWidth="2"
            />
          </g>
        );
      })}
    </svg>
  );
}
