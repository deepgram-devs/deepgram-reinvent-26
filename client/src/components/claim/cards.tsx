"use client";

import { useState, type ReactNode } from "react";

import {
  conditionTone,
  formatDate,
  formatTime,
  type ClaimView,
} from "@/lib/claim";

import { CarDiagram } from "./CarDiagram";
import { FocusCard } from "./FocusCard";
import { StylizedMap } from "./StylizedMap";

function Card({ id, title, children, className = "" }: { id: string; title: string; children: ReactNode; className?: string }) {
  return (
    <FocusCard id={id} className={`card p-6 ${className}`}>
      <h2 className="label text-ink/80">{title}</h2>
      <div className="mt-5">{children}</div>
    </FocusCard>
  );
}

function Field({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={`mt-0.5 text-lg leading-snug ${mono ? "font-mono text-base" : ""}`}>{children}</dd>
    </div>
  );
}

function Rows({ rows, total }: { rows: { label: string; value: string; sub?: boolean }[]; total?: { label: string; value: string } }) {
  return (
    <dl className="divide-y divide-line">
      {rows.map((row, i) => (
        <div key={`${row.label}-${i}`} className={`flex items-baseline justify-between gap-4 py-2.5 ${row.sub ? "pl-3 text-muted" : ""}`}>
          <dt className="min-w-0 text-[0.95rem]">{row.label}</dt>
          <dd className="max-w-[60%] shrink-0 text-right font-mono text-[0.95rem] text-balance">{row.value}</dd>
        </div>
      ))}
      {total && (
        <div className="flex items-baseline justify-between gap-4 pt-3">
          <dt className="font-semibold">{total.label}</dt>
          <dd className="font-mono text-lg font-semibold">{total.value}</dd>
        </div>
      )}
    </dl>
  );
}

export function WhenWhereCard({ claim }: { claim: ClaimView }) {
  const { incident, location } = claim;
  return (
    <Card id="claim-location" title="When and where">
      <StylizedMap address={location.address} />
      <dl className="mt-5 space-y-4">
        <Field label="Date">
          {formatDate(incident.date)} · {formatTime(incident.time)}
        </Field>
        <Field label="Location">{location.address}</Field>
        {location.description && (
          <Field label="Location description">
            <span className="text-[1.05rem]">&ldquo;{location.description}&rdquo;</span>
          </Field>
        )}
      </dl>
    </Card>
  );
}

export function IncidentCard({ claim }: { claim: ClaimView }) {
  const { incident, other_party: other } = claim;
  return (
    <Card id="claim-incident" title="Incident">
      <dl className="space-y-4">
        <Field label="Type">{incident.type}</Field>
        <Field label="Detail">{incident.detail}</Field>
      </dl>
      {other ? (
        <dl className="mt-5 space-y-4 border-t border-line pt-5">
          <Field label="Other driver’s vehicle">{other.vehicle}</Field>
          <Field label="Other driver">
            {other.driver}
            <span className="mt-1 block text-base text-muted">{other.insurer}</span>
          </Field>
        </dl>
      ) : (
        <p className="mt-5 border-t border-line pt-5 text-muted">No other driver on this claim.</p>
      )}
      <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5">
        <Field label="Weather">{incident.weather}</Field>
        <Field label="Injuries">{incident.injuries}</Field>
        <Field label="Police report" mono>
          {incident.police_report}
        </Field>
        <Field label="Fault">{incident.fault.split(";")[0]}</Field>
      </dl>
    </Card>
  );
}

const DOT = { ok: "bg-lime", warn: "bg-orange", bad: "bg-red" };

export function VehicleConditionCard({ claim }: { claim: ClaimView }) {
  const { damage } = claim;
  const [view, setView] = useState<"exterior" | "interior">(
    damage.exterior_areas.length === 0 && damage.interior_areas.length > 0 ? "interior" : "exterior",
  );
  const areas = view === "exterior" ? damage.exterior_areas : damage.interior_areas;

  return (
    <Card id="claim-condition" title="Vehicle condition">
      <p className="flex items-start gap-2.5 text-lg leading-snug">
        <span className={`mt-2 size-2.5 shrink-0 rounded-full ${DOT[conditionTone(damage.condition)]}`} />
        {damage.condition}
      </p>

      <div role="tablist" aria-label="Damage view" className="mt-5 inline-flex rounded-full bg-paper p-1">
        {(["exterior", "interior"] as const).map((tab) => (
          <button
            key={tab}
            role="tab"
            type="button"
            aria-selected={view === tab}
            onClick={() => setView(tab)}
            className={`label rounded-full px-4 py-2 transition ${view === tab ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
          >
            {tab}
            {(tab === "exterior" ? damage.exterior_areas : damage.interior_areas).length > 0 && (
              <span className="ml-1.5 text-red">●</span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <CarDiagram view={view} damaged={areas} />
      </div>
      <ul className="mt-3 flex min-h-8 flex-wrap gap-2">
        {areas.length ? (
          areas.map((area) => (
            <li key={area} className="flex items-center gap-1.5 rounded-full bg-red/10 px-3 py-1 text-sm text-red">
              <span className="size-1.5 rounded-full bg-red" />
              {area}
            </li>
          ))
        ) : (
          <li className="text-sm text-muted">{damage.areas_note || `No ${view} damage reported.`}</li>
        )}
      </ul>
      {damage.description && damage.description !== damage.areas_note && (
        <p className="mt-3 text-[0.95rem] text-muted">{damage.description}</p>
      )}

      <div className="mt-5 border-t border-line pt-5">
        <h3 className="text-sm text-muted">Damage photos · {damage.photo_count}</h3>
        <ul className="mt-3 grid grid-cols-3 gap-2.5">
          {damage.photos.map((caption) => (
            <li
              key={caption}
              title={caption}
              className="flex aspect-[4/3] items-center justify-center rounded-xl border border-dashed border-ink/25 bg-paper p-2 text-center text-xs leading-tight text-muted"
            >
              <span className="line-clamp-3">{caption}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

export function EstimateCard({ claim }: { claim: ClaimView }) {
  if (claim.valuation) {
    const rows = claim.valuation.filter((r) => !/^Settlement offer$/i.test(r.label));
    const offer = claim.valuation.find((r) => /^Settlement offer$/i.test(r.label));
    return (
      <Card id="claim-estimate" title="Total loss valuation">
        <Rows rows={rows} total={offer && { label: offer.label, value: offer.value }} />
      </Card>
    );
  }
  if (!claim.estimate) return null;
  return (
    <Card id="claim-estimate" title="Repair estimate">
      <Rows rows={claim.estimate.items} total={{ label: "Total estimate", value: claim.estimate.total }} />
    </Card>
  );
}

export function PaymentsCard({ claim }: { claim: ClaimView }) {
  const rows = claim.financials.filter((f) => f.label !== "Paid to date");
  const paid = claim.financials.find((f) => f.label === "Paid to date");
  return (
    <Card id="claim-payments" title="Payments">
      <Rows rows={rows} total={paid} />
    </Card>
  );
}

export function CoverageCard({ claim }: { claim: ClaimView }) {
  return (
    <Card id="claim-coverage" title="Coverage">
      <Rows rows={claim.coverage.map((c) => ({ label: c.name, value: c.value.replace(/, up to .*/, "") }))} />
    </Card>
  );
}

export function StoryCard({ claim }: { claim: ClaimView }) {
  return (
    <Card id="claim-story" title="What happened">
      <p className="text-[1.05rem] leading-relaxed">{claim.description}</p>
    </Card>
  );
}

export function AdjusterCard({ claim }: { claim: ClaimView }) {
  const { adjuster, notes } = claim;
  return (
    <Card id="claim-adjuster" title="Adjuster and notes">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="Adjuster">{adjuster.name}</Field>
        <Field label="Department">{adjuster.department}</Field>
        <Field label="Status">{adjuster.status}</Field>
        <Field label="Next review">{formatDate(adjuster.next_review)}</Field>
      </dl>
      <ol className="mt-6 space-y-4 border-t border-line pt-5">
        {notes.map((note, i) => (
          <li key={i} className="grid grid-cols-[6.5rem_1fr] gap-4">
            <span className="label pt-0.5 text-muted">{formatDate(note.date, false)}</span>
            <span className="leading-snug">{note.text}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
