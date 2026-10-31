import { useEffect, useMemo, useState } from 'react';
import type { Profile } from '@/lib/types';
import { DeptCalendar } from '@/components/calendar/DeptCalendar';
import {
  fetchComms,
  fetchMilestones,
  seedCommsForYear,
  seedMilestonesForComms,
  updateMilestone,
  type CommType,
  type PartnershipComm,
  type PartnershipCommsMilestone,
} from '@/lib/partnerships-tabs';

// Color groups publications by the KIND of production work behind them, not by individual
// title — matches the approved mockup (https://claude.ai/artifact/XvLqFAbQrNJk7HFui14xnL).
const COLOR_BY_FAMILY: Record<string, { bg: string; text: string; legend: string }> = {
  tsm: { bg: '#1E4D30', text: '#fff', legend: 'TSM' },
  sparrow_spotlight: { bg: '#F0A500', text: '#1A1A1A', legend: 'The Sparrow Spotlight' },
  annual_report: { bg: '#6B3F69', text: '#fff', legend: 'Annual Report' },
  giving_tuesday: { bg: '#4A6FA5', text: '#fff', legend: 'Standalone Asks' },
  christmas_cards: { bg: '#8C5A3C', text: '#fff', legend: 'Physical mail production' },
};

function familyFor(commType: CommType): string {
  return commType.startsWith('tsm') ? 'tsm' : commType;
}

const BAR_HEIGHT = 46;
const BAR_GAP = 6;

function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface ProductionWindow {
  comm: PartnershipComm;
  start: string; // ISO
  end: string; // ISO, inclusive — always the publish date
  milestones: PartnershipCommsMilestone[];
}

/** Earliest milestone due date through the publish date; a comm with no milestone
 *  checklist (Giving Tuesday, Christmas Cards) just gets a short 3-day window. */
function windowFor(comm: PartnershipComm, milestones: PartnershipCommsMilestone[]): ProductionWindow {
  if (milestones.length > 0) {
    const start = milestones.reduce((min, m) => (m.due_date < min ? m.due_date : min), milestones[0].due_date);
    return { comm, start, end: comm.publish_date, milestones };
  }
  const d = new Date(comm.publish_date + 'T00:00:00');
  d.setDate(d.getDate() - 3);
  return { comm, start: localISO(d), end: comm.publish_date, milestones: [] };
}

interface WeekSegment {
  key: string;
  title: string;
  bg: string;
  text: string;
  startCol: number;
  span: number;
  lane: number;
  milestoneMarks: { id: string; commId: string; label: string; due_date: string; owner_id: string | null; completed_at: string | null; leftPct: number }[];
}

interface WeekLayout {
  segments: WeekSegment[];
  height: number;
}

export function CommsProductionCalendar({ profiles }: { profiles: Profile[] }) {
  const [showComms, setShowComms] = useState(true);
  const [showEvents, setShowEvents] = useState(true);
  const [visibleYear, setVisibleYear] = useState(new Date().getFullYear());
  const [visibleMonth, setVisibleMonth] = useState(new Date().getMonth());
  const [comms, setComms] = useState<PartnershipComm[]>([]);
  const [milestonesByComm, setMilestonesByComm] = useState<Record<string, PartnershipCommsMilestone[]>>({});
  const [openMilestoneId, setOpenMilestoneId] = useState<string | null>(null);
  const [openCommId, setOpenCommId] = useState<string | null>(null);

  const ownerProfiles = profiles.filter(
    (p) => (p.department === 'partnerships' || p.partnerships_access) && p.department !== 'exec',
  );
  const bethanyId = profiles.find((p) => p.full_name.toLowerCase().startsWith('bethany'))?.id ?? null;

  useEffect(() => {
    const years = new Set([visibleYear]);
    if (visibleMonth === 0) years.add(visibleYear - 1);
    if (visibleMonth === 11) years.add(visibleYear + 1);

    let cancelled = false;
    (async () => {
      for (const y of years) await seedCommsForYear(y);
      const rows = (await Promise.all(Array.from(years).map((y) => fetchComms(y)))).flat();
      if (cancelled) return;
      setComms(rows);
      await seedMilestonesForComms(rows, bethanyId);
      const milestones = await fetchMilestones(rows.map((r) => r.id));
      if (cancelled) return;
      const grouped: Record<string, PartnershipCommsMilestone[]> = {};
      for (const m of milestones) (grouped[m.comm_id] ??= []).push(m);
      setMilestonesByComm(grouped);
    })().catch(console.error);

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleYear, visibleMonth, bethanyId]);

  const windows = useMemo(
    () => comms.map((c) => windowFor(c, milestonesByComm[c.id] ?? [])),
    [comms, milestonesByComm],
  );

  function layoutForWeek(week: Date[]): WeekLayout {
    const weekDates = week.map(localISO);
    const weekStart = weekDates[0];
    const weekEnd = weekDates[6];

    type Raw = Omit<WeekSegment, 'lane'>;
    const raw: Raw[] = [];
    for (const w of windows) {
      if (w.end < weekStart || w.start > weekEnd) continue;
      let startCol = 0;
      for (let c = 0; c < 7; c++) { if (weekDates[c] >= w.start) { startCol = c; break; } }
      let endCol = 6;
      for (let c = 6; c >= 0; c--) { if (weekDates[c] <= w.end) { endCol = c; break; } }
      const span = endCol - startCol + 1;
      const family = familyFor(w.comm.comm_type);
      const colors = COLOR_BY_FAMILY[family] ?? COLOR_BY_FAMILY.tsm;
      const isStart = w.start >= weekStart;

      const milestoneMarks = w.milestones
        .filter((m) => m.due_date >= weekStart && m.due_date <= weekEnd)
        .map((m) => {
          const col = weekDates.indexOf(m.due_date);
          const posInSeg = col - startCol;
          const leftPct = span > 1 ? (posInSeg / span) * 100 : 0;
          return { id: m.id, commId: w.comm.id, label: m.label, due_date: m.due_date, owner_id: m.owner_id, completed_at: m.completed_at, leftPct };
        });

      raw.push({
        key: w.comm.id,
        title: isStart ? w.comm.title : '',
        bg: colors.bg,
        text: colors.text,
        startCol,
        span,
        milestoneMarks,
      });
    }

    raw.sort((a, b) => b.span - a.span || a.startCol - b.startCol);
    const laneEnds: number[] = [];
    const segments: WeekSegment[] = raw.map((seg) => {
      let lane = laneEnds.findIndex((end) => end < seg.startCol);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = seg.startCol + seg.span - 1;
      return { ...seg, lane };
    });

    const numLanes = segments.length > 0 ? Math.max(...segments.map((s) => s.lane)) + 1 : 0;
    return { segments, height: numLanes > 0 ? numLanes * (BAR_HEIGHT + BAR_GAP) : 0 };
  }

  function weekOverlayHeight(week: Date[]): number {
    if (!showComms) return 0;
    return layoutForWeek(week).height;
  }

  function weekOverlay(week: Date[]) {
    if (!showComms) return null;
    const { segments } = layoutForWeek(week);
    if (segments.length === 0) return null;
    return (
      <>
        {segments.map((seg, i) => (
          <div
            key={`${seg.key}-${i}`}
            style={{
              position: 'absolute',
              top: seg.lane * (BAR_HEIGHT + BAR_GAP),
              left: `calc(${(seg.startCol / 7) * 100}% + 2px)`,
              width: `calc(${(seg.span / 7) * 100}% - 4px)`,
              height: BAR_HEIGHT,
              background: seg.bg,
              borderRadius: 8,
              padding: '5px 8px',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              overflow: 'visible',
            }}
          >
            <span style={{ color: seg.text, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {seg.title}
            </span>
            <div style={{ position: 'relative', flex: 1 }}>
              {seg.milestoneMarks.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setOpenCommId(m.commId); setOpenMilestoneId(m.id); }}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    position: 'absolute',
                    left: `${m.leftPct}%`,
                    top: 0,
                    whiteSpace: 'nowrap',
                    fontSize: 9.5,
                    fontWeight: 600,
                    color: seg.text,
                    textDecoration: m.completed_at ? 'line-through' : 'none',
                    opacity: m.completed_at ? 0.55 : 1,
                    borderLeft: `2px solid ${seg.text}`,
                    paddingLeft: 3,
                  }}
                >
                  {m.completed_at ? '✓ ' : ''}{m.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </>
    );
  }

  const openMilestone = openMilestoneId
    ? (milestonesByComm[openCommId ?? ''] ?? []).find((m) => m.id === openMilestoneId) ?? null
    : null;

  function patchOpenMilestone(patch: Partial<Pick<PartnershipCommsMilestone, 'due_date' | 'owner_id' | 'completed_at'>>) {
    if (!openMilestoneId || !openCommId) return;
    setMilestonesByComm((prev) => ({
      ...prev,
      [openCommId]: (prev[openCommId] ?? []).map((m) => (m.id === openMilestoneId ? { ...m, ...patch } : m)),
    }));
    updateMilestone(openMilestoneId, patch).catch(console.error);
  }

  return (
    <div className="relative h-[calc(100vh-260px)] min-h-[500px]">
      <DeptCalendar
        department="partnerships"
        showEvents={showEvents}
        onMonthChange={(y, m) => { setVisibleYear(y); setVisibleMonth(m); }}
        weekOverlay={weekOverlay}
        weekOverlayHeight={weekOverlayHeight}
        extraToolbar={
          <div className="ml-2 flex items-center gap-1.5">
            <button
              onClick={() => setShowEvents((v) => !v)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium ${showEvents ? 'bg-sparrow-green text-white' : 'border border-sparrow-rule dark:border-sparrow-dark-border text-sparrow-gray dark:text-sparrow-dark-gray'}`}
            >
              Events
            </button>
            <button
              onClick={() => setShowComms((v) => !v)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium ${showComms ? 'bg-sparrow-green text-white' : 'border border-sparrow-rule dark:border-sparrow-dark-border text-sparrow-gray dark:text-sparrow-dark-gray'}`}
            >
              Comms Production
            </button>
          </div>
        }
      />

      {showComms && (
        <div className="flex flex-wrap gap-4 px-4 pb-2 pt-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
          {Object.values(COLOR_BY_FAMILY).map((c) => (
            <span key={c.legend} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: c.bg }} />
              {c.legend}
            </span>
          ))}
        </div>
      )}

      {openMilestone && (
        <div
          className="fixed bottom-7 left-1/2 z-20 w-[360px] -translate-x-1/2 rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-4 shadow-xl"
        >
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-sm font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">{openMilestone.label}</span>
            <button
              onClick={() => { setOpenMilestoneId(null); setOpenCommId(null); }}
              aria-label="Close"
              className="text-base leading-none text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink"
            >
              ×
            </button>
          </div>
          <label className="mb-2.5 block text-[11px] text-sparrow-gray dark:text-sparrow-dark-gray">
            Due date
            <input
              type="date"
              value={openMilestone.due_date}
              onChange={(e) => patchOpenMilestone({ due_date: e.target.value })}
              className="field-input mt-0.5 w-full py-1.5 text-sm"
            />
          </label>
          <label className="mb-3 block text-[11px] text-sparrow-gray dark:text-sparrow-dark-gray">
            Owner
            <select
              value={openMilestone.owner_id ?? ''}
              onChange={(e) => patchOpenMilestone({ owner_id: e.target.value || null })}
              className="field-input mt-0.5 w-full py-1.5 text-sm"
            >
              <option value="">Unassigned</option>
              {ownerProfiles.map((op) => (
                <option key={op.id} value={op.id}>{op.full_name}</option>
              ))}
            </select>
          </label>
          <div className="flex items-center justify-between">
            <button
              onClick={() => patchOpenMilestone({ completed_at: openMilestone.completed_at ? null : new Date().toISOString() })}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                openMilestone.completed_at
                  ? 'border-sparrow-green bg-sparrow-green text-white'
                  : 'border-sparrow-green text-sparrow-green dark:text-sparrow-dark-green'
              }`}
            >
              {openMilestone.completed_at ? 'Mark not done' : 'Mark done'}
            </button>
            <button
              onClick={() => { setOpenMilestoneId(null); setOpenCommId(null); }}
              className="btn-primary py-1.5 text-xs"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
