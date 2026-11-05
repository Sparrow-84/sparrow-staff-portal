import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { RoomSopsButton } from '@/components/documents/RoomSops';
import { fetchProfiles } from '@/lib/data';
import { fetchPartners } from '@/lib/partnerships';
import type { Partner } from '@/lib/partnerships-types';
import type { Profile } from '@/lib/types';
import {
  SERVES_ALL,
  SERVES_OPTIONS,
  fetchServices,
  freshness,
  providerName,
  servesGroup,
  type ResidentService,
} from '@/lib/resident-services';
import { FreshnessStamp } from './Freshness';
import { ServiceDetailPanel } from './ServiceDetailPanel';
import { ServiceFormPanel } from './ServiceFormPanel';

const ALL_TYPES = 'All';

export function ResidentServicesRoom() {
  const { profile } = useAuth();
  const [services, setServices] = useState<ResidentService[]>([]);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [typeFilter, setTypeFilter] = useState(ALL_TYPES);
  const [whoFilter, setWhoFilter] = useState<string>(SERVES_ALL);
  const [needsCheckOnly, setNeedsCheckOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ResidentService | null>(null);

  const load = useCallback(async () => {
    const [res, profs, parts] = await Promise.all([
      fetchServices(),
      fetchProfiles().catch(() => [] as Profile[]),
      fetchPartners().catch(() => [] as Partner[]),
    ]);
    setServices(res.services);
    setMissing(res.missing);
    setProfiles(profs);
    setPartners(parts);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const isPartnershipsStaff = profile?.role === 'admin' || profile?.department === 'partnerships';

  // Anyone with this room's access can own a service. Exec excluded, same as Partnerships owners.
  const ownerOptions = useMemo(
    () => profiles.filter((p) =>
      p.department !== 'exec'
      && (p.role === 'admin' || p.department === 'partnerships' || p.partnerships_access || p.resident_services_access)),
    [profiles],
  );

  const typesInUse = useMemo(() => {
    const set = new Set(services.map((s) => s.service_type));
    return [ALL_TYPES, ...Array.from(set).sort()];
  }, [services]);

  const inType = useMemo(
    () => services.filter((s) => typeFilter === ALL_TYPES || s.service_type === typeFilter),
    [services, typeFilter],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inType
      .filter((s) => servesGroup(s, whoFilter))
      .filter((s) => !needsCheckOnly || freshness(s.last_checked_at) !== 'fresh')
      .filter((s) => !q || `${providerName(s)} ${s.name} ${s.how_to_access ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => providerName(a).localeCompare(providerName(b)) || a.name.localeCompare(b.name));
  }, [inType, whoFilter, needsCheckOnly, search]);

  const publishedCount = services.filter((s) => s.published_at).length;
  const needsCheckCount = services.filter((s) => freshness(s.last_checked_at) !== 'fresh').length;
  const selected = services.find((s) => s.id === selectedId) ?? null;
  const nameFor = (id: string | null) => (id ? profiles.find((p) => p.id === id)?.full_name ?? null : null);

  const typeLabel = typeFilter === ALL_TYPES ? 'services' : `${typeFilter.toLowerCase()} services`;

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

      <div className="mt-6 space-y-3">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Type</p>
          <div className="flex flex-wrap gap-1.5">
            {typesInUse.map((t) => (
              <button key={t} onClick={() => setTypeFilter(t)} aria-pressed={typeFilter === t} className={chip(typeFilter === t)}>{t}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">Who it serves</p>
          <div className="flex flex-wrap gap-1.5">
            {SERVES_OPTIONS.map((g) => (
              <button key={g} onClick={() => setWhoFilter(g)} aria-pressed={whoFilter === g} className={chip(whoFilter === g)}>{g}</button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-baseline gap-2 rounded-xl bg-sparrow-mist/70 dark:bg-sparrow-dark-surface2 px-4 py-2.5">
            {whoFilter === SERVES_ALL ? (
              <>
                <span className="font-serif text-2xl font-semibold tabular-nums">{inType.length}</span>
                <span className="text-sm">{typeLabel} on file</span>
              </>
            ) : (
              <>
                <span className="font-serif text-2xl font-semibold tabular-nums">{inType.filter((s) => servesGroup(s, whoFilter)).length}</span>
                <span className="text-sm">of</span>
                <span className="font-serif text-2xl font-semibold tabular-nums">{inType.length}</span>
                <span className="text-sm">{typeLabel} near us serve <strong>{whoFilter.toLowerCase()}</strong></span>
              </>
            )}
          </div>
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

      <ServiceDetailPanel
        open={!!selected && !formOpen}
        service={selected}
        profiles={profiles}
        ownerOptions={ownerOptions}
        currentUserId={profile?.id ?? ''}
        isPartnershipsStaff={isPartnershipsStaff}
        onClose={() => setSelectedId(null)}
        onEdit={() => { setEditing(selected); setFormOpen(true); }}
        onChanged={() => void load()}
      />
      <ServiceFormPanel
        open={formOpen}
        service={editing}
        partners={partners}
        onClose={() => setFormOpen(false)}
        onSaved={(id) => { void load(); setSelectedId(id); }}
      />
    </div>
  );
}
