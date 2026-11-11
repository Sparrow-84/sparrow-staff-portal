import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { RoomSopsButton } from '@/components/documents/RoomSops';
import { fetchProfiles } from '@/lib/data';
import { fetchPartners } from '@/lib/partnerships';
import type { Partner } from '@/lib/partnerships-types';
import type { Profile } from '@/lib/types';
import {
  AREA_OPTIONS,
  PERSON_GROUPS,
  SERVES_ALL,
  SERVES_FILTER_LABEL,
  fetchArchivedServices,
  fetchOpenReviews,
  fetchServices,
  freshness,
  providerName,
  matchesAreas,
  matchesPerson,
  type ResidentService,
  type ServiceReview,
} from '@/lib/resident-services';
import { FreshnessStamp } from './Freshness';
import { ServiceDetailPanel } from './ServiceDetailPanel';
import { ServiceFormPanel } from './ServiceFormPanel';
import { ReviewPanel } from './ReviewPanel';
import { PrintList } from './PrintList';

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function ResidentServicesRoom() {
  const { profile } = useAuth();
  const [allServices, setAllServices] = useState<ResidentService[]>([]);
  const [archived, setArchived] = useState<ResidentService[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [reviews, setReviews] = useState<ServiceReview[]>([]);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  // Each filter row takes several picks; no picks = everything.
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [whoFilter, setWhoFilter] = useState<string[]>([]);
  const [areaFilter, setAreaFilter] = useState<string[]>([]);
  const [needsCheckOnly, setNeedsCheckOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ResidentService | null>(null);
  const [printing, setPrinting] = useState(false);
  const endPrint = useCallback(() => setPrinting(false), []);

  const load = useCallback(async () => {
    const [res, revs, profs, parts, arch] = await Promise.all([
      fetchServices(),
      fetchOpenReviews(),
      fetchProfiles().catch(() => [] as Profile[]),
      fetchPartners().catch(() => [] as Partner[]),
      fetchArchivedServices(),
    ]);
    setArchived(arch);
    setAllServices(res.services);
    setReviews(revs);
    setMissing(res.missing);
    setProfiles(profs);
    setPartners(parts);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const isPartnershipsStaff = profile?.role === 'admin' || profile?.department === 'partnerships';

  // Services added while reviewing something from the Directory stay out of the main list
  // (and its counts) until the organization is marked reviewed.
  const services = useMemo(() => allServices.filter((s) => !s.needs_review), [allServices]);
  const review = reviews.find((r) => r.id === reviewId) ?? null;
  const pendingForReview = useMemo(
    () => (review ? allServices.filter((s) => s.needs_review && s.partner_id === review.partner_id) : []),
    [allServices, review],
  );
  // The form's organization list needs the review's organization even if it isn't in the
  // Directory list this person can load.
  const formPartners = useMemo(() => {
    if (!review?.partner || partners.some((p) => p.id === review.partner_id)) return partners;
    return [...partners, review.partner as unknown as Partner];
  }, [partners, review]);

  const typesInUse = useMemo(() => {
    const set = new Set(services.map((s) => s.service_type));
    return Array.from(set).sort();
  }, [services]);

  // Type + location narrow the pool; "who it's for" is then counted against it ("3 of 8").
  const inType = useMemo(
    () => services.filter((s) => (typeFilter.length === 0 || typeFilter.includes(s.service_type)) && matchesAreas(s, areaFilter)),
    [services, typeFilter, areaFilter],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inType
      .filter((s) => matchesPerson(s, whoFilter))
      .filter((s) => !needsCheckOnly || freshness(s.last_checked_at) !== 'fresh')
      .filter((s) => !q || `${providerName(s)} ${s.name} ${s.how_to_access ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => providerName(a).localeCompare(providerName(b)) || a.name.localeCompare(b.name));
  }, [inType, whoFilter, needsCheckOnly, search]);

  const publishedCount = services.filter((s) => s.published_at).length;
  const needsCheckCount = services.filter((s) => freshness(s.last_checked_at) !== 'fresh').length;
  const selected = (showArchived ? archived : services).find((s) => s.id === selectedId) ?? null;
  const nameFor = (id: string | null) => (id ? profiles.find((p) => p.id === id)?.full_name ?? null : null);

  const typeLabel = typeFilter.length === 0 ? 'services' : `${typeFilter.join(' / ').toLowerCase()} services`;
  const anyFilter = typeFilter.length + whoFilter.length + areaFilter.length > 0;
  const allChip = (active: boolean, onClick: () => void) => (
    <button onClick={onClick} aria-pressed={active} className={chip(active)}>All</button>
  );

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium transition ${
      active
        ? 'border-sparrow-green bg-sparrow-green text-white dark:border-sparrow-dark-green dark:bg-sparrow-dark-green'
        : 'border-sparrow-rule dark:border-sparrow-dark-border text-sparrow-ink dark:text-sparrow-dark-ink hover:border-sparrow-green'
    }`;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Resident Services</h1>
          <p className="mt-1 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
            {services.length} services near us · {publishedCount} on the website · {needsCheckCount} need re-checking
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <RoomSopsButton room="resident-services" />
          <button onClick={() => { setEditing(null); setFormOpen(true); }} className="btn-primary" disabled={missing}>
            + Add a service
          </button>
        </div>
      </div>

      {missing && !loading && (
        <p className="mt-6 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          This room is waiting on a database update (migration 0199). It will start working as soon as that runs.
        </p>
      )}

      {reviews.length > 0 && (
        <section className="mt-6 rounded-xl border border-amber-300 bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-500/10 p-4">
          <h2 className="font-serif text-lg font-semibold">To review ({reviews.length})</h2>
          <p className="mt-0.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
            Sent over from the Partnerships Directory. Nothing here is checked or on the main list until you review it.
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {reviews.map((r) => (
              <button
                key={r.id}
                onClick={() => setReviewId(r.id)}
                className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-white dark:bg-sparrow-dark-surface px-3 py-2.5 text-left transition hover:border-sparrow-green"
              >
                <span className="block font-medium">{r.partner?.name ?? 'Organization'}</span>
                <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                  Sent {new Date(r.sent_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  {nameFor(r.sent_by) ? ` by ${nameFor(r.sent_by)}` : ''}
                  {(() => {
                    const n = allServices.filter((s) => s.needs_review && s.partner_id === r.partner_id).length;
                    return n ? ` · ${n} program${n === 1 ? '' : 's'} added` : '';
                  })()}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="mt-6 flex justify-end">
        <button
          onClick={() => { setShowArchived((v) => !v); setSelectedId(null); }}
          className="text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-green hover:underline"
        >
          {showArchived ? '← Back to the list' : `Archived (${archived.length})`}
        </button>
      </div>

      {showArchived ? (
        <div className="mt-2">
          <h2 className="font-serif text-lg font-semibold">Archived services</h2>
          <p className="mt-0.5 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Closed or no longer offered. Open one to restore it.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {archived.length === 0 && <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Nothing archived.</p>}
            {archived.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className="grid gap-1 rounded-xl border border-dashed border-sparrow-rule dark:border-sparrow-dark-border bg-white/60 dark:bg-sparrow-dark-surface p-4 text-left transition hover:border-sparrow-green"
              >
                <span className="font-serif text-lg font-semibold leading-tight">{providerName(s)}</span>
                <span className="text-sm">{s.name} · {s.service_type}</span>
                <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                  Archived {s.archived_at ? new Date(s.archived_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (<>
      <div className="mt-2 space-y-3">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Type</p>
          <div className="flex flex-wrap gap-1.5">
            {allChip(typeFilter.length === 0, () => setTypeFilter([]))}
            {typesInUse.map((t) => (
              <button key={t} onClick={() => setTypeFilter((f) => toggle(f, t))} aria-pressed={typeFilter.includes(t)} className={chip(typeFilter.includes(t))}>{t}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Who it's for · pick everything that fits the person</p>
          <div className="flex flex-wrap gap-1.5">
            {allChip(whoFilter.length === 0, () => setWhoFilter([]))}
            {PERSON_GROUPS.map((g) => (
              <button key={g} onClick={() => setWhoFilter((f) => toggle(f, g))} aria-pressed={whoFilter.includes(g)} className={chip(whoFilter.includes(g))}>{SERVES_FILTER_LABEL[g] ?? g}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Where</p>
          <div className="flex flex-wrap gap-1.5">
            {allChip(areaFilter.length === 0, () => setAreaFilter([]))}
            {AREA_OPTIONS.map((a) => (
              <button key={a} onClick={() => setAreaFilter((f) => toggle(f, a))} aria-pressed={areaFilter.includes(a)} className={chip(areaFilter.includes(a))}>{a}</button>
            ))}
            {anyFilter && (
              <button onClick={() => { setTypeFilter([]); setWhoFilter([]); setAreaFilter([]); }} className="ml-1 text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-green hover:underline">
                Clear all filters
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-baseline gap-2 rounded-xl bg-sparrow-mist/70 dark:bg-sparrow-dark-surface2 px-4 py-2.5">
            {whoFilter.length === 0 ? (
              <>
                <span className="font-serif text-2xl font-semibold tabular-nums">{inType.length}</span>
                <span className="text-sm">{typeLabel} on file</span>
              </>
            ) : (
              <>
                <span className="font-serif text-2xl font-semibold tabular-nums">{inType.filter((s) => matchesPerson(s, whoFilter)).length}</span>
                <span className="text-sm">of</span>
                <span className="font-serif text-2xl font-semibold tabular-nums">{inType.length}</span>
                <span className="text-sm">{typeLabel} fit <strong>{whoFilter.map((g) => (SERVES_FILTER_LABEL[g] ?? g).toLowerCase()).join(' + ')}</strong></span>
              </>
            )}
          </div>
          <button
            onClick={() => setPrinting(true)}
            disabled={visible.length === 0}
            className="btn-secondary px-3 py-1.5 text-sm"
            title="Print the services on screen as a Sparrow handout"
          >
            Print this list ({visible.length})
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={needsCheckOnly} onChange={(e) => setNeedsCheckOnly(e.target.checked)} className="h-4 w-4 accent-sparrow-green" />
            Only ones that need re-checking
          </label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by organization or service…"
            className="field-input mt-0 w-full sm:ml-auto sm:w-64"
          />
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {loading && <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Loading…</p>}
        {!loading && !missing && visible.length === 0 && (
          <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
            {services.length === 0 ? 'No services yet. Click "+ Add a service" to add the first one.' : 'No services match these filters.'}
          </p>
        )}
        {visible.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelectedId(s.id)}
            className="grid gap-2 rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-4 text-left transition hover:border-sparrow-green dark:hover:border-sparrow-dark-green"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-serif text-lg font-semibold leading-tight">{providerName(s)}</span>
              <span className="rounded-full bg-sparrow-mist dark:bg-sparrow-dark-surface2 px-2 py-0.5 text-[11px] font-medium">{s.service_type}</span>
            </div>
            <span className="text-sm">{s.name}</span>
            {s.help_phone && <span className="select-text text-sm font-medium tabular-nums">{s.help_phone}</span>}
            <div className="flex flex-wrap gap-1">
              {s.serves.map((g) => (
                <span
                  key={g}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    g === 'Families with children'
                      ? 'border border-sparrow-gold bg-sparrow-gold/15'
                      : g === SERVES_ALL
                        ? 'bg-sparrow-green/10 text-sparrow-green dark:text-sparrow-dark-green'
                        : 'bg-sparrow-mist dark:bg-sparrow-dark-surface2'
                  }`}
                >
                  {g}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <FreshnessStamp checkedAt={s.last_checked_at} checkedBy={s.last_checked_by} how={s.last_checked_how} nameFor={nameFor} />
              {s.published_at && <span className="text-[11px] font-medium text-sparrow-green dark:text-sparrow-dark-green">On website</span>}
            </div>
          </button>
        ))}
      </div>
      </>)}

      {printing && (
        <PrintList
          services={visible}
          // What the person came in for first: the types picked, in the order picked.
          typeOrder={[
            ...typeFilter,
            ...Array.from(new Set(visible.map((s) => s.service_type))).filter((t) => !typeFilter.includes(t)).sort(),
          ]}
          onDone={endPrint}
        />
      )}

      <ServiceDetailPanel
        open={!!selected && !formOpen}
        service={selected}
        profiles={profiles}
        currentUserId={profile?.id ?? ''}
        isPartnershipsStaff={isPartnershipsStaff}
        archived={showArchived}
        onClose={() => setSelectedId(null)}
        onEdit={() => { setEditing(selected); setFormOpen(true); }}
        onChanged={() => void load()}
      />
      <ReviewPanel
        open={!!review && !formOpen}
        review={review}
        pendingServices={pendingForReview}
        profiles={profiles}
        currentUserId={profile?.id ?? ''}
        onClose={() => setReviewId(null)}
        onAddService={() => { setEditing(null); setFormOpen(true); }}
        onEditService={(s) => { setEditing(s); setFormOpen(true); }}
        onChanged={() => void load()}
      />
      <ServiceFormPanel
        open={formOpen}
        service={editing}
        partners={formPartners}
        presetPartnerId={review?.partner_id ?? null}
        forReview={!!review}
        onClose={() => setFormOpen(false)}
        onSaved={(id) => { void load(); if (!review) setSelectedId(id); }}
      />
    </div>
  );
}
