import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { fetchProfiles } from '@/lib/data';
import { fetchOptedInCount, fetchSpaces, fetchTenants, fetchWorkOrders, type WorkOrderWithAssignee } from '@/lib/housing';
import { supabase } from '@/lib/supabase';
import {
  LOT_LEGEND,
  OPEN_WO_STATUSES,
  WO_PRIORITIES,
  workOrderWhere,
  type Space,
  type Tenant,
  type WoPriority,
} from '@/lib/housing-types';
import type { Profile } from '@/lib/types';
import { LotGrid } from './LotGrid';
import { LotMap } from './LotMap';
import { LotDetailPanel } from './LotDetailPanel';
import { WorkOrderPanel } from './WorkOrderPanel';
import { IncidentLogTab } from './IncidentLogTab';
import { ResidentsTab } from './ResidentsTab';
import { NoticesTab } from './NoticesTab';
import { ArchiveTab } from './ArchiveTab';

const PRIORITY_RANK: Record<WoPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export function TwinOaksRoom() {
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

  // Emergency alert modal
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [optedInCount, setOptedInCount] = useState<number | null>(null);
  const [alertResult, setAlertResult] = useState<{ sent: number; failed: number } | null>(null);
  const [alertError, setAlertError] = useState<string | null>(null);
  const [alertPending, startAlertTransition] = useTransition();

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

  function openAlertModal() {
    setAlertMessage('');
    setAlertResult(null);
    setAlertError(null);
    setAlertOpen(true);
    void fetchOptedInCount().then(setOptedInCount).catch(() => setOptedInCount(null));
  }

  function sendAlert() {
    if (!alertMessage.trim()) return;
    startAlertTransition(async () => {
      setAlertError(null);
      setAlertResult(null);
      try {
        const { data, error } = await supabase.functions.invoke('send-park-alert', {
          body: { message: alertMessage.trim() },
        });
        if (error) throw new Error(error.message);
        setAlertResult(data as { sent: number; failed: number });
        setAlertMessage('');
      } catch (e) {
        setAlertError(e instanceof Error ? e.message : 'Could not send alert.');
      }
    });
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
        <div className="flex items-center gap-2">
          {canManage && (
            <button
              onClick={openAlertModal}
              className="rounded-xl border border-priority-p1 px-3 py-2 text-sm font-semibold text-priority-p1 transition hover:bg-priority-p1 hover:text-white"
            >
              Send emergency alert
            </button>
          )}
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
            <LotGrid spaces={spaces} onSelect={openLot} />
          ) : (
            <LotMap spaces={spaces} onSelect={openLot} selectedId={selectedSpaceId} />
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

      {/* Emergency alert modal */}
      {alertOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-sparrow-ink/40"
            onClick={() => !alertPending && setAlertOpen(false)}
            aria-hidden
          />
          <div className="fixed inset-x-4 top-1/4 z-50 mx-auto max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="mb-1 font-serif text-lg font-semibold text-priority-p1">Send emergency alert</h2>
            <p className="mb-4 text-xs text-sparrow-gray">
              This sends an SMS to every adult who has opted into park alerts.
              {optedInCount !== null && (
                <span className="ml-1 font-semibold text-sparrow-ink">
                  {optedInCount} resident{optedInCount !== 1 ? 's' : ''} will receive this message.
                </span>
              )}
            </p>

            {alertResult ? (
              <div className="rounded-xl bg-sparrow-mist px-4 py-3 text-sm">
                <p className="font-semibold text-sparrow-green">Alert sent.</p>
                <p className="text-sparrow-gray">{alertResult.sent} delivered · {alertResult.failed} failed</p>
                <button onClick={() => setAlertOpen(false)} className="btn-primary mt-4 w-full">
                  Close
                </button>
              </div>
            ) : (
              <>
                <textarea
                  className="field-input mb-4 w-full"
                  rows={4}
                  placeholder="e.g. There is a water main break. Please avoid using water until further notice."
                  value={alertMessage}
                  onChange={(e) => setAlertMessage(e.target.value)}
                  disabled={alertPending}
                />
                {alertError && <p className="mb-3 text-sm text-priority-p1">{alertError}</p>}
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setAlertOpen(false)}
                    disabled={alertPending}
                    className="btn-ghost"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={sendAlert}
                    disabled={alertPending || !alertMessage.trim()}
                    className="rounded-xl bg-priority-p1 px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-40 hover:bg-red-700"
                  >
                    {alertPending ? 'Sending…' : 'Send to all opted-in residents'}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
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
