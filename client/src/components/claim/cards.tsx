"use client";

import { useState, type ReactNode } from "react";

import { fieldLabel, useLocale, useT } from "@/i18n";
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

/**
 * Label and value lines as the agent sent them. A label the dictionary knows
 * is translated; the rest, and every value, show as recorded.
 */
function Rows({ rows, total }: { rows: { label: string; value: string; sub?: boolean }[]; total?: { label: string; value: string } }) {
  const t = useT();
  return (
    <dl className="divide-y divide-line">
      {rows.map((row, i) => (
        <div key={`${row.label}-${i}`} className={`flex items-baseline justify-between gap-4 py-2.5 ${row.sub ? "pl-3 text-muted" : ""}`}>
          <dt className="min-w-0 text-[0.95rem]">{fieldLabel(t, row.label)}</dt>
          <dd className="max-w-[60%] shrink-0 text-right font-mono text-[0.95rem] text-balance">{row.value}</dd>
        </div>
      ))}
      {total && (
        <div className="flex items-baseline justify-between gap-4 pt-3">
          <dt className="font-semibold">{fieldLabel(t, total.label)}</dt>
          <dd className="font-mono text-lg font-semibold">{total.value}</dd>
        </div>
      )}
    </dl>
  );
}

export function WhenWhereCard({ claim }: { claim: ClaimView }) {
  const { incident, location } = claim;
  const t = useT();
  const locale = useLocale();
  return (
    <Card id="claim-location" title={t.claim.whenWhere}>
      <StylizedMap address={location.address} />
      <dl className="mt-5 space-y-4">
        <Field label={t.claim.date}>
          {formatDate(incident.date, locale)} · {formatTime(incident.time)}
        </Field>
        <Field label={t.claim.location}>{location.address}</Field>
        {location.description && (
          <Field label={t.claim.locationDescription}>
            <span className="text-[1.05rem]">&ldquo;{location.description}&rdquo;</span>
          </Field>
        )}
      </dl>
    </Card>
  );
}

export function IncidentCard({ claim }: { claim: ClaimView }) {
  const { incident, other_party: other } = claim;
  const t = useT();
  return (
    <Card id="claim-incident" title={t.claim.incident}>
      <dl className="space-y-4">
        <Field label={t.claim.type}>{incident.type}</Field>
        <Field label={t.claim.detail}>{incident.detail}</Field>
      </dl>
      {other ? (
        <dl className="mt-5 space-y-4 border-t border-line pt-5">
          <Field label={t.claim.otherVehicle}>{other.vehicle}</Field>
          <Field label={t.claim.otherDriver}>
            {other.driver}
            <span className="mt-1 block text-base text-muted">{other.insurer}</span>
          </Field>
        </dl>
      ) : (
        <p className="mt-5 border-t border-line pt-5 text-muted">{t.claim.noOtherDriver}</p>
      )}
      <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5">
        <Field label={t.claim.weather}>{incident.weather}</Field>
        <Field label={t.claim.injuries}>{incident.injuries}</Field>
        <Field label={t.claim.policeReport} mono>
          {incident.police_report}
        </Field>
        <Field label={t.claim.fault}>{incident.fault.split(";")[0]}</Field>
      </dl>
    </Card>
  );
}

const DOT = { ok: "bg-lime", warn: "bg-orange", bad: "bg-red" };

export function VehicleConditionCard({ claim }: { claim: ClaimView }) {
  const { damage } = claim;
  const t = useT();
  const [view, setView] = useState<"exterior" | "interior">(
    damage.exterior_areas.length === 0 && damage.interior_areas.length > 0 ? "interior" : "exterior",
  );
  const areas = view === "exterior" ? damage.exterior_areas : damage.interior_areas;

  return (
    <Card id="claim-condition" title={t.claim.vehicleCondition}>
      <p className="flex items-start gap-2.5 text-lg leading-snug">
        <span className={`mt-2 size-2.5 shrink-0 rounded-full ${DOT[conditionTone(damage.condition)]}`} />
        {damage.condition}
      </p>

      <div role="tablist" aria-label={t.claim.damageView} className="mt-5 inline-flex rounded-full bg-paper p-1">
        {(["exterior", "interior"] as const).map((tab) => (
          <button
            key={tab}
            role="tab"
            type="button"
            aria-selected={view === tab}
            onClick={() => setView(tab)}
            className={`label rounded-full px-4 py-2 transition ${view === tab ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
          >
            {tab === "exterior" ? t.claim.exterior : t.claim.interior}
            {(tab === "exterior" ? damage.exterior_areas : damage.interior_areas).length > 0 && (
              <span className="ml-1.5 text-red">●</span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <CarDiagram
          damaged={areas}
          view={view}
          label={t.claim.damageDiagram(
            view === "exterior" ? t.claim.exterior : t.claim.interior,
            areas.join(", ") || t.claim.none,
          )}
        />
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
          <li className="text-sm text-muted">{damage.areas_note || (view === "exterior" ? t.claim.noExteriorDamage : t.claim.noInteriorDamage)}</li>
        )}
      </ul>
      {damage.description && damage.description !== damage.areas_note && (
        <p className="mt-3 text-[0.95rem] text-muted">{damage.description}</p>
      )}

      <div className="mt-5 border-t border-line pt-5">
        <h3 className="text-sm text-muted">
          {t.claim.damagePhotos} · {damage.photo_count}
        </h3>
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
  const t = useT();
  if (claim.valuation) {
    const rows = claim.valuation.filter((r) => !/^Settlement offer$/i.test(r.label));
    const offer = claim.valuation.find((r) => /^Settlement offer$/i.test(r.label));
    return (
      <Card id="claim-estimate" title={t.claim.totalLoss}>
        <Rows rows={rows} total={offer && { label: offer.label, value: offer.value }} />
      </Card>
    );
  }
  if (!claim.estimate) return null;
  return (
    <Card id="claim-estimate" title={t.claim.repairEstimate}>
      <Rows rows={claim.estimate.items} total={{ label: t.claim.totalEstimate, value: claim.estimate.total }} />
    </Card>
  );
}

export function PaymentsCard({ claim }: { claim: ClaimView }) {
  const rows = claim.financials.filter((f) => f.label !== "Paid to date");
  const paid = claim.financials.find((f) => f.label === "Paid to date");
  const t = useT();
  return (
    <Card id="claim-payments" title={t.claim.payments}>
      <Rows rows={rows} total={paid} />
    </Card>
  );
}

export function CoverageCard({ claim }: { claim: ClaimView }) {
  const t = useT();
  return (
    <Card id="claim-coverage" title={t.claim.coverage}>
      <Rows rows={claim.coverage.map((c) => ({ label: c.name, value: c.value.replace(/, up to .*/, "") }))} />
    </Card>
  );
}

export function StoryCard({ claim }: { claim: ClaimView }) {
  const t = useT();
  return (
    <Card id="claim-story" title={t.claim.whatHappened}>
      <p className="text-[1.05rem] leading-relaxed">{claim.description}</p>
    </Card>
  );
}

export function AdjusterCard({ claim }: { claim: ClaimView }) {
  const { adjuster, notes } = claim;
  const t = useT();
  const locale = useLocale();
  return (
    <Card id="claim-adjuster" title={t.claim.adjusterAndNotes}>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label={t.claim.adjuster}>{adjuster.name}</Field>
        <Field label={t.claim.department}>{adjuster.department}</Field>
        <Field label={t.claim.status}>{adjuster.status}</Field>
        <Field label={t.claim.nextReview}>{formatDate(adjuster.next_review, locale)}</Field>
      </dl>
      <ol className="mt-6 space-y-4 border-t border-line pt-5">
        {notes.map((note, i) => (
          <li key={i} className="grid grid-cols-[6.5rem_1fr] gap-4">
            <span className="label pt-0.5 text-muted">{formatDate(note.date, locale, false)}</span>
            <span className="leading-snug">{note.text}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
