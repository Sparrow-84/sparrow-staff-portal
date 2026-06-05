import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { fetchProfiles } from '@/lib/data';
import { fetchSpaces, fetchTenants, fetchWorkOrders, type WorkOrderWithAssignee } from '@/lib/housing';
import {
  LOT_LEGEND,
  LOT_COLOR_CLASSES,
  OPEN_WO_STATUSES,
  WO_PRIORITIES,
  workOrderWhere,
  type Space,
  type Tenant,
  type WoPriority,
} from '@/lib/housing-types';
import type { Profile } from '@/lib/types';
import { LotGrid } from './LotGrid';
import { LotDetailPanel } from './LotDetailPanel';
import { WorkOrderPanel } from './WorkOrderPanel';

const PRIORITY_RANK: Record<WoPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export function TwinOaksRoom() {
  const { profile } = useAuth();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrderWithAssignee[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<'property' | 'workorders'>('property');
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [lotOpen, setLotOpen] = useState(false);
  const [woOpen, setWoOpen] = useState(false);
  const [editWo, setEditWo] = useState<WorkOrderWithAssignee | null>(null);
  const [prefillSpaceId, setPrefillSpaceId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [sp, tn, wo, st] = await Promise.all([
        fetchSpaces(),
        fetchTenants(),
        fetchWorkOrders(),
        fetchProfiles(),
      ]);
      setSpaces(sp);
      setTenants(tn);
      setWorkOrders(wo);
      setStaff(st);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load Twin Oaks data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const canManage = profile?.role === 'admin' || profile?.department === 'toc';

  const openWoSpaceIds = useMemo(() => {
    const set = new Set<string>();
    for (const w of workOrders) {
      if (w.space_id && OPEN_WO_STATUSES.includes(w.status)) set.add(w.space_id);
    }
    return set;
  }, [workOrders]);

  const tenantBySpace = useMemo(() => {
    const map = new Map<string, Tenant>();
    for (const t of tenants) {
      if (t.space_id && t.status === 'active') map.set(t.space_id, t);
    }
    return map;
  }, [tenants]);

  const lotLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of spaces) map.set(s.id, s.label);
    return map;
  }, [spaces]);

  const openWorkOrders = useMemo(
    () =>
      workOrders
        .filter((w) => OPEN_WO_STATUSES.includes(w.status))
        .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]),
    [workOrders],
  );
  const doneWorkOrders = useMemo(
    () => workOrders.filter((w) => !OPEN_WO_STATUSES.includes(w.status)),
    [workOrders],
  );

  const occupied = spaces.filter((s) => s.status === 'occupied').length;
  const vacant = spaces.filter((s) => s.status === 'vacant').length;

  function openLot(space: Space) {
    setSelectedSpaceId(space.id);
    setLotOpen(true);
  }
  function newWorkOrder(spaceId: string | null) {
    setEditWo(null);
    setPrefillSpaceId(spaceId);
    setLotOpen(false);
    setWoOpen(true);
  }
  function openWorkOrder(w: WorkOrderWithAssignee) {
    setEditWo(w);
    setPrefillSpaceId(null);
    setLotOpen(false);
    setWoOpen(true);
  }

  if (loading) return <p className="p-8 text-sm text-sparrow-gray">Loading Twin Oaks…</p>;
  if (error) return <p className="p-8 text-sm text-priority-p1">{error}</p>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Twin Oaks</h1>
          <p className="mt-1 text-sm text-sparrow-gray">
            {occupied} occupied · {vacant} vacant · {openWorkOrders.length} open work orders
          </p>
        </div>
        {tab === 'workorders' && canManage && (
          <button onClick={() => newWorkOrder(null)} className="btn-primary">
            + New work order
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="mt-6 inline-flex rounded-xl border border-sparrow-rule bg-white p-1 text-sm">
        {(['property', 'workorders'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 font-medium transition ${
              tab === t ? 'bg-sparrow-green text-white' : 'text-sparrow-gray hover:text-sparrow-ink'
            }`}
          >
            {t === 'property' ? 'Property' : 'Work orders'}
          </button>
        ))}
      </div>

      {tab === 'property' ? (
        <div className="mt-6">
          <div className="mb-4 flex flex-wrap gap-4">
            {LOT_LEGEND.map((l) => (
              <span key={l.color} className="flex items-center gap-1.5 text-xs text-sparrow-gray">
                <span className={`h-3 w-3 rounded border ${LOT_COLOR_CLASSES[l.color]}`} aria-hidden />
                {l.label}
              </span>
            ))}
          </div>
          <LotGrid spaces={spaces} openWoSpaceIds={openWoSpaceIds} onSelect={openLot} />
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          <WorkOrderSection title="Open" items={openWorkOrders} lotLabelById={lotLabelById} onOpen={openWorkOrder} />
          {doneWorkOrders.length > 0 && (
            <WorkOrderSection
              title="Completed"
              items={doneWorkOrders}
              lotLabelById={lotLabelById}
              onOpen={openWorkOrder}
            />
          )}
          {workOrders.length === 0 && (
            <p className="rounded-xl border border-dashed border-sparrow-rule bg-white p-8 text-center text-sm text-sparrow-gray">
              No work orders.
            </p>
          )}
        </div>
      )}

      <LotDetailPanel
        open={lotOpen}
        space={selectedSpaceId ? spaces.find((s) => s.id === selectedSpaceId) ?? null : null}
        tenant={selectedSpaceId ? tenantBySpace.get(selectedSpaceId) ?? null : null}
        workOrders={selectedSpaceId ? workOrders.filter((w) => w.space_id === selectedSpaceId) : []}
        canManage={canManage}
        onClose={() => setLotOpen(false)}
        onChanged={load}
        onNewWorkOrder={newWorkOrder}
        onSelectWorkOrder={openWorkOrder}
      />

      <WorkOrderPanel
        open={woOpen}
        workOrder={editWo}
        prefillSpaceId={prefillSpaceId}
        spaces={spaces}
        staff={staff}
        onClose={() => setWoOpen(false)}
        onChanged={load}
      />
    </div>
  );
}

function WorkOrderSection({
  title,
  items,
  lotLabelById,
  onOpen,
}: {
  title: string;
  items: WorkOrderWithAssignee[];
  lotLabelById: Map<string, string>;
  onOpen: (w: WorkOrderWithAssignee) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sparrow-gray">
        {title} <span className="text-sparrow-gray/70">· {items.length}</span>
      </h2>
      <ul className="divide-y divide-sparrow-rule overflow-hidden rounded-xl border border-sparrow-rule bg-white">
        {items.map((w) => {
          const dot = WO_PRIORITIES.find((p) => p.value === w.priority)?.dot ?? 'bg-priority-p4';
          return (
            <li key={w.id}>
              <button
                onClick={() => onOpen(w)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-sparrow-mist"
              >
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-sparrow-green">
                    {workOrderWhere(w, lotLabelById)}
                  </span>
                  <span className="block text-sm text-sparrow-ink">{w.description}</span>
                  {w.assignee && (
                    <span className="block text-xs text-sparrow-gray">{w.assignee.full_name}</span>
                  )}
                </span>
                <span className="shrink-0 text-xs capitalize text-sparrow-gray">
                  {w.status.replace('_', ' ')}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
