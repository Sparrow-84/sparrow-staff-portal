import { useEffect, useState } from 'react';
import { localDate, localDateOf } from '@/lib/date';
import {
  fetchComms,
  seedCommsForYear,
  updateCommStatus,
  updateCommNotes,
  type CommStatus,
  type PartnershipComm,
} from '@/lib/partnerships-tabs';

const STATUS_LABEL: Record<CommStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  sent: 'Sent',
};

const STATUS_CHIP: Record<CommStatus, string> = {
  not_started: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-amber-100 text-amber-700',
  sent: 'bg-sparrow-green/10 text-sparrow-green',
};

const STATUS_CYCLE: CommStatus[] = ['not_started', 'in_progress', 'sent'];

function nextStatus(current: CommStatus): CommStatus {
  const idx = STATUS_CYCLE.indexOf(current);
  return STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
}

function shortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function milestones(publishDate: string): { label: string; date: string }[] {
  return [
    { label: 'Contributor content due (Audrey/Shelly)', date: addDays(publishDate, -10) },
    { label: 'Draft 1 → Susanna', date: addDays(publishDate, -7) },
    { label: 'Susanna notes back', date: addDays(publishDate, -5) },
    { label: 'Draft 2 → Susanna', date: addDays(publishDate, -3) },
    { label: 'Susanna notes back', date: addDays(publishDate, -1) },
    { label: 'Final draft → Publish', date: shortDate(publishDate) },
  ];
}

function isTsm(comm: PartnershipComm): boolean {
  return comm.comm_type.startsWith('tsm');
}

// December's Christmas greeting (Andrew + Shelly, together) and January's leadership
// letters (Andrew as ED, Shelly as LCP Director, separately) need writers assigned and
// coordinated months ahead — not just flagged 2 weeks out like a normal TSM issue.
function needsAdvanceNotice(comm: PartnershipComm): boolean {
  return comm.comm_type === 'tsm_christmas' || comm.comm_type === 'christmas_cards' || comm.comm_type === 'annual_report';
}

function isLeadTimeWarning(comm: PartnershipComm): boolean {
  if (comm.status !== 'not_started') return false;
  const diff = (new Date(comm.publish_date + 'T00:00:00').getTime() - Date.now()) / 86_400_000;
  const window = needsAdvanceNotice(comm) ? 60 : 14;
  return diff >= 0 && diff <= window;
}

export function PartnershipCommsTab() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [comms, setComms] = useState<PartnershipComm[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notesById, setNotesById] = useState<Record<string, string>>({});

  useEffect(() => {
    setLoading(true);
    setExpandedId(null);
    seedCommsForYear(year)
      .then(() => fetchComms(year))
      .then((rows) => {
        setComms(rows);
        const notes: Record<string, string> = {};
        for (const r of rows) notes[r.id] = r.notes ?? '';
        setNotesById(notes);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [year]);

  function handleCycleStatus(comm: PartnershipComm) {
    const next = nextStatus(comm.status);
    setComms((prev) => prev.map((c) => (c.id === comm.id ? { ...c, status: next } : c)));
    updateCommStatus(comm.id, next).catch(console.error);
  }

  function handleBlurNotes(comm: PartnershipComm) {
    const notes = notesById[comm.id] ?? '';
    if (notes !== (comm.notes ?? '')) {
      updateCommNotes(comm.id, notes).catch(console.error);
    }
  }

  const asksSent = comms.filter((c) => c.is_financial_ask && c.status === 'sent').length;
  const asksCounterColor =
    asksSent === 0 ? 'text-slate-500 bg-slate-100'
    : asksSent === 1 ? 'text-sparrow-green bg-sparrow-green/10'
    : asksSent === 2 ? 'text-amber-600 bg-amber-100'
    : 'text-red-600 bg-red-100';

  const todayISO = localDate();

  return (
    <div className="space-y-4">
      {/* Header: year nav + ask counter */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setYear((y) => y - 1)}
            className="rounded-lg px-2 py-1.5 text-sparrow-gray hover:bg-sparrow-mist hover:text-sparrow-ink"
          >
            ←
          </button>
          <span className="min-w-[64px] text-center text-sm font-semibold text-sparrow-ink">
            {year}
          </span>
          <button
            onClick={() => setYear((y) => y + 1)}
            className="rounded-lg px-2 py-1.5 text-sparrow-gray hover:bg-sparrow-mist hover:text-sparrow-ink"
          >
            →
          </button>
        </div>

        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${asksCounterColor}`}>
          {asksSent} of 3 financial asks used
        </span>
      </div>

      {loading && (
        <p className="py-8 text-center text-sm text-sparrow-gray">Loading…</p>
      )}

      {!loading && comms.length === 0 && (
        <p className="rounded-xl border border-dashed border-sparrow-rule p-8 text-center text-sm text-sparrow-gray">
          No comms entries for {year}.
        </p>
      )}

      {!loading && comms.length > 0 && (
        <ul className="divide-y divide-sparrow-rule overflow-hidden rounded-xl border border-sparrow-rule bg-white">
          {comms.map((comm) => {
            const expanded = expandedId === comm.id;
            const warn = isLeadTimeWarning(comm);
            const isPast = comm.publish_date < todayISO;

            return (
              <li key={comm.id}>
                {/* Row */}
                <button
                  onClick={() => setExpandedId(expanded ? null : comm.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-sparrow-mist"
                >
                  <span className="w-14 shrink-0 text-xs text-sparrow-gray">
                    {shortDate(comm.publish_date)}
                  </span>

                  <span className={`flex-1 text-sm font-medium ${isPast && comm.status !== 'sent' ? 'text-sparrow-gray' : 'text-sparrow-ink'}`}>
                    {comm.title}
                  </span>

                  <span className="flex items-center gap-2">
                    {comm.is_financial_ask && (
                      <span className="rounded-full bg-sparrow-gold/20 px-2 py-0.5 text-[10px] font-medium text-sparrow-ink">
                        Ask
                      </span>
                    )}
                    {warn && (
                      <span
                        title={needsAdvanceNotice(comm) ? 'Needs writer assignment + advance coordination — not yet started' : 'Publish date within 14 days — not yet started'}
                        className="text-amber-500 text-sm"
                      >
                        ⚠
                      </span>
                    )}
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); handleCycleStatus(comm); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); handleCycleStatus(comm); } }}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium cursor-pointer ${STATUS_CHIP[comm.status]}`}
                    >
                      {STATUS_LABEL[comm.status]}
                    </span>
                    <span className="text-xs text-sparrow-gray">{expanded ? '▲' : '▼'}</span>
                  </span>
                </button>

                {/* Accordion */}
                {expanded && (
                  <div className="border-t border-sparrow-rule bg-sparrow-mist/30 px-4 py-4 space-y-4">
                    {/* Status selector */}
                    <div>
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray">
                        Status
                      </p>
                      <div className="flex gap-2">
                        {STATUS_CYCLE.map((s) => (
                          <button
                            key={s}
                            onClick={() => {
                              setComms((prev) => prev.map((c) => (c.id === comm.id ? { ...c, status: s } : c)));
                              updateCommStatus(comm.id, s).catch(console.error);
                            }}
                            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                              comm.status === s
                                ? STATUS_CHIP[s] + ' ring-2 ring-offset-1 ring-current'
                                : 'bg-white border border-sparrow-rule text-sparrow-gray hover:bg-sparrow-mist'
                            }`}
                          >
                            {STATUS_LABEL[s]}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray">
                        Notes
                      </label>
                      <textarea
                        className="field-input w-full resize-none text-sm"
                        rows={2}
                        placeholder="Add notes…"
                        value={notesById[comm.id] ?? ''}
                        onChange={(e) => setNotesById((prev) => ({ ...prev, [comm.id]: e.target.value }))}
                        onBlur={() => handleBlurNotes(comm)}
                      />
                    </div>

                    {/* TSM milestones */}
                    {isTsm(comm) && (
                      <div>
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray">
                          Production milestones
                        </p>
                        <ul className="space-y-1">
                          {milestones(comm.publish_date).map((m, i) => {
                            const milestoneDateRaw = new Date(comm.publish_date + 'T00:00:00');
                            milestoneDateRaw.setDate(milestoneDateRaw.getDate() + [-10, -7, -5, -3, -1, 0][i]);
                            const isPastMilestone = localDateOf(milestoneDateRaw) < todayISO;
                            return (
                              <li
                                key={i}
                                className={`flex items-center gap-3 text-sm ${isPastMilestone ? 'text-sparrow-gray/60' : 'text-sparrow-ink'}`}
                              >
                                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isPastMilestone ? 'bg-sparrow-rule' : 'bg-sparrow-green'}`} />
                                <span className="w-20 shrink-0 text-xs text-sparrow-gray">{m.date}</span>
                                <span>{m.label}</span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    {/* December note */}
                    {(comm.comm_type === 'tsm_christmas' || comm.comm_type === 'christmas_cards') && (
                      <p className="rounded-lg border border-sparrow-gold/30 bg-sparrow-gold/5 px-3 py-2 text-xs text-sparrow-ink">
                        Andrew &amp; Shelly write the founders' Christmas greeting this month.
                        Give minimum 2 weeks notice — ideally calendared months in advance.
                      </p>
                    )}

                    {/* January note */}
                    {comm.comm_type === 'annual_report' && (
                      <p className="rounded-lg border border-sparrow-gold/30 bg-sparrow-gold/5 px-3 py-2 text-xs text-sparrow-ink">
                        Andrew and Shelly each write a leadership letter in January (separately —
                        professional/forward-looking tone, distinct from December's warm personal greeting).
                        Give minimum 2 weeks notice — ideally calendared months in advance.
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
