import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { fetchProfiles } from '@/lib/data';
import { fetchAllNotices, fetchSpaces, fetchTenants, fetchWorkOrders, type WorkOrderWithAssignee } from '@/lib/housing';
import {
  LOT_LEGEND,
  OPEN_WO_STATUSES,
  WO_PRIORITIES,
  workOrderWhere,
  type NoticeType,
  type Space,
  type Tenant,
  type WoPriority,
} from '@/lib/housing-types';
import type { Profile } from '@/lib/types';
import { RoomTour, useRoomTour, type TourStep } from '@/components/RoomTour';
import { LotGrid } from './LotGrid';
import { LotMap } from './LotMap';
import { LotDetailPanel } from './LotDetailPanel';
import { WorkOrderPanel } from './WorkOrderPanel';
import { IncidentLogTab } from './IncidentLogTab';
import { ResidentsTab } from './ResidentsTab';
import { NoticesTab } from './NoticesTab';
import { ArchiveTab } from './ArchiveTab';

const PRIORITY_RANK: Record<WoPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

const TOC_TOUR_STEPS: TourStep[] = [
  {
    icon: '🏡',
    title: 'Twin Oaks',
    body: "This room is the hub for everything Twin Oaks — the property, the residents, and the day-to-day work of keeping it running well. Let's walk through what's here.",
    tag: null,
  },
  {
    icon: '🗺️',
    title: 'Property view',
    body: "The Property tab shows every lot as a card. Green means occupied, gray means vacant. Toggle to Map view for a visual layout. Click any lot to open its full detail panel — tenant info, household members, pets, parking, and notes.",
    tag: { icon: '🏘️', label: 'Property' },
  },
  {
    icon: '🔧',
    title: 'Work orders',
    body: "Log maintenance requests here. Each work order tracks the issue, the lot, priority, and who's assigned. Mark it done when resolved — it stays in the history so nothing is lost.",
    tag: { icon: '🔧', label: 'Work Orders' },
  },
  {
    icon: '👥',
    title: 'Residents & notices',
    body: "The Residents tab gives you a searchable list of everyone across all lots. Notices tracks formal rent notices by type. Incidents is your documentation log for anything that needs a record.",
    tag: { icon: '👥', label: 'Residents' },
  },
  {
    icon: '📂',
    title: 'Archive',
    body: "Past tenants and closed lot records live in Archive. Nothing in Twin Oaks gets permanently deleted — it moves here instead, so the history is always available.",
    tag: { icon: '📂', label: 'Archive' },
  },
  {
    icon: '✨',
    title: "You're all set",
    body: "That's Twin Oaks. Click any lot to get started, or open Work Orders to see what's on the board.",
    tag: null,
  },
];

export function TwinOaksRoom() {
  const { tourOpen, dismissTour } = useRoomTour('sparrow_toc_toured_v1');
  const { profile } = useAuth();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrderWithAssignee[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<'property' | 'residents' | 'workorders' | 'notices' | 'incidents' | 'archive'>('property');
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [lotOpen, setLotOpen] = useState(false);
  const [woOpen, setWoOpen] = useState(false);
  const [editWo, setEditWo] = useState<WorkOrderWithAssignee | null>(null);
  const [prefillSpaceId, setPrefillSpaceId] = useState<string | null>(null);

  const [noticeMap, setNoticeMap] = useState<Record<string, NoticeType>>({});

  const refreshNoticeMap = useCallback(async () => {
    try {
      const all = await fetchAllNotices();
      const order: NoticeType[] = ['E', '3', '2', '1'];
      const map: Record<string, NoticeType> = {};
      for (const n of all) {
        const current = map[n.space_id];
        if (!current || order.indexOf(n.notice_type) < order.indexOf(current)) {
          map[n.space_id] = n.notice_type;
        }
      }
      setNoticeMap(map);
    } catch { /* non-fatal */ }
  }, []);


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
    void refreshNoticeMap();
  }, [load, refreshNoticeMap]);

  const canManage = profile?.role === 'admin' || profile?.department === 'toc';

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
      <RoomTour steps={TOC_TOUR_STEPS} open={tourOpen} onDismiss={dismissTour} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Twin Oaks</h1>
          <p className="mt-1 text-sm text-sparrow-gray">
            {occupied} occupied · {vacant} vacant · {openWorkOrders.length} open work orders
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'workorders' && canManage && (
            <button onClick={() => newWorkOrder(null)} className="btn-primary">
              + New work order
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex flex-wrap gap-1 rounded-xl border border-sparrow-rule bg-white p-1 text-sm">
        {(
          [
            { key: 'property',   label: 'Property' },
            { key: 'residents',  label: 'Residents' },
            { key: 'workorders', label: 'Work orders' },
            { key: 'notices',    label: 'Notices' },
            ...(canManage ? [{ key: 'incidents', label: 'Incidents' }, { key: 'archive', label: 'Archive' }] : []),
          ] as { key: typeof tab; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-lg px-3 py-1.5 font-medium transition ${
              tab === key ? 'bg-sparrow-green text-white' : 'text-sparrow-gray hover:text-sparrow-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'archive' ? (
        <ArchiveTab spaces={spaces} tenants={tenants} />
      ) : tab === 'incidents' ? (
        <IncidentLogTab spaces={spaces} />
      ) : tab === 'residents' ? (
        <ResidentsTab
          spaces={spaces}
          tenants={tenants}
          onSelectSpace={(spaceId) => { setSelectedSpaceId(spaceId); setLotOpen(true); }}
        />
      ) : tab === 'notices' ? (
        <NoticesTab
          spaces={spaces}
          tenants={tenants}
          canManage={canManage}
          onSelectSpace={(spaceId) => { setSelectedSpaceId(spaceId); setLotOpen(true); setTab('property'); }}
        />
      ) : tab === 'property' ? (
        <div className="mt-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="flex flex-wrap gap-4">
              {LOT_LEGEND.map((l) => (
                <span key={l.key} className="flex items-center gap-1.5 text-xs text-sparrow-gray">
                  <span className={`h-3 w-3 rounded border ${l.classes}`} aria-hidden />
                  {l.label}
                </span>
              ))}
            </div>
            <div className="flex shrink-0 overflow-hidden rounded-lg border border-sparrow-rule">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1.5 text-xs font-medium transition ${viewMode === 'grid' ? 'bg-gray-800 text-white' : 'bg-white text-sparrow-gray hover:bg-gray-50'}`}
              >
                Grid
              </button>
              <button
                onClick={() => setViewMode('map')}
                className={`border-l border-sparrow-rule px-3 py-1.5 text-xs font-medium transition ${viewMode === 'map' ? 'bg-gray-800 text-white' : 'bg-white text-sparrow-gray hover:bg-gray-50'}`}
              >
                Map
              </button>
            </div>
          </div>
          {viewMode === 'grid' ? (
            <LotGrid spaces={spaces} onSelect={openLot} noticeMap={noticeMap} />
          ) : (
            <LotMap spaces={spaces} onSelect={openLot} selectedId={selectedSpaceId} noticeMap={noticeMap} />
          )}
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
        onNoticeChange={refreshNoticeMap}
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
