import { useEffect, useMemo, useState } from 'react';
import { localDate } from '@/lib/date';
import { assignAvatarColors } from '@/lib/avatarColors';
import type { Profile } from '@/lib/types';
import {
  NEWSLETTER_EARLY_HEADS_UP_DAYS,
  NEWSLETTER_HEADS_UP_DAYS,
  createMilestone,
  deleteMilestone,
  fetchComms,
  fetchMilestones,
  fetchRecurringSetting,
  needsAdvanceNotice,
  newsletterHeadsUpDays,
  newsletterReminderDue,
  seedCommsForYear,
  seedMilestonesForComms,
  syncCommsMilestoneTasks,
  syncNewsletterReminderTasks,
  updateCommStatus,
  updateCommNotes,
  updateMilestone,
  updateRecurringSetting,
  type CommStatus,
  type PartnershipComm,
  type PartnershipCommsMilestone,
  type PartnershipRecurringSetting,
} from '@/lib/partnerships-tabs';

const STATUS_LABEL: Record<CommStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  sent: 'Sent',
};

const STATUS_CHIP: Record<CommStatus, string> = {
  not_started: 'bg-slate-100 dark:bg-slate-500/15 text-slate-600 dark:text-slate-300',
  in_progress: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300',
  sent: 'bg-sparrow-green/10 text-sparrow-green dark:text-sparrow-dark-green',
};

const STATUS_CYCLE: CommStatus[] = ['not_started', 'in_progress', 'sent'];

function shortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}



export function PartnershipCommsTab({ profiles }: { profiles: Profile[] }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [comms, setComms] = useState<PartnershipComm[]>([]);
  const [milestonesByComm, setMilestonesByComm] = useState<Record<string, PartnershipCommsMilestone[]>>({});
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [setting, setSetting] = useState<PartnershipRecurringSetting | null>(null);
  const [newMilestoneLabel, setNewMilestoneLabel] = useState<Record<string, string>>({});
  const [newMilestoneDate, setNewMilestoneDate] = useState<Record<string, string>>({});

  // Same standing-owner exclusion used everywhere else in the room — Andrew is never a
  // selectable milestone owner beyond his one-time major-donor call.
  const ownerProfiles = profiles.filter(
    (p) => (p.department === 'partnerships' || p.partnerships_access) && p.department !== 'exec',
  );
  const bethanyId = profiles.find((p) => p.full_name.toLowerCase().startsWith('bethany'))?.id ?? null;
  const ownerColors = useMemo(() => assignAvatarColors(profiles), [profiles]);

  useEffect(() => {
    setLoading(true);
    setExpandedId(null);
    seedCommsForYear(year)
      .then(() => fetchComms(year))
      .then(async (rows) => {
        setComms(rows);
        const notes: Record<string, string> = {};
        for (const r of rows) notes[r.id] = r.notes ?? '';
        setNotesById(notes);
        // Every milestone defaults to Bethany — she reassigns individual ones (e.g. to
        // the Partnerships Manager, or back to Unassigned) from the row below afterward.
        await seedMilestonesForComms(rows, bethanyId);
        const milestones = await fetchMilestones(rows.map((r) => r.id));
        const grouped: Record<string, PartnershipCommsMilestone[]> = {};
        for (const m of milestones) {
          (grouped[m.comm_id] ??= []).push(m);
        }
        setMilestonesByComm(grouped);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [year, bethanyId]);

  useEffect(() => {
    syncNewsletterReminderTasks().catch(console.error);
    syncCommsMilestoneTasks().catch(console.error);
    fetchRecurringSetting('newsletter').then(setSetting).catch(console.error);
  }, []);

  function handleStatusChange(comm: PartnershipComm, next: CommStatus) {
    setComms((prev) => prev.map((c) => (c.id === comm.id ? { ...c, status: next } : c)));
    updateCommStatus(comm.id, next).catch(console.error);
  }

  async function changeReminderOwner(ownerId: string) {
    if (!ownerId || !setting) return;
    setSetting({ ...setting, owner_id: ownerId });
    await updateRecurringSetting('newsletter', { owner_id: ownerId }).catch(console.error);
  }

  function handleBlurNotes(comm: PartnershipComm) {
    const notes = notesById[comm.id] ?? '';
    if (notes !== (comm.notes ?? '')) {
      updateCommNotes(comm.id, notes).catch(console.error);
    }
  }

  function handleMilestoneChange(commId: string, milestoneId: string, patch: Partial<Pick<PartnershipCommsMilestone, 'due_date' | 'owner_id' | 'completed_at'>>) {
    setMilestonesByComm((prev) => ({
      ...prev,
      [commId]: (prev[commId] ?? []).map((m) => (m.id === milestoneId ? { ...m, ...patch } : m)),
    }));
    updateMilestone(milestoneId, patch).catch(console.error);
  }

  function toggleMilestoneDone(commId: string, m: PartnershipCommsMilestone) {
    handleMilestoneChange(commId, m.id, { completed_at: m.completed_at ? null : new Date().toISOString() });
  }

  function handleDeleteMilestone(commId: string, milestoneId: string) {
    setMilestonesByComm((prev) => ({
      ...prev,
      [commId]: (prev[commId] ?? []).filter((m) => m.id !== milestoneId),
    }));
    deleteMilestone(milestoneId).catch(console.error);
  }

  function handleAddMilestone(commId: string) {
    const label = (newMilestoneLabel[commId] ?? '').trim();
    const dueDate = newMilestoneDate[commId];
    if (!label || !dueDate) return;
    const sortOrder = (milestonesByComm[commId] ?? []).length;
    createMilestone(commId, label, dueDate, null, sortOrder)
      .then((created) => {
        setMilestonesByComm((prev) => ({ ...prev, [commId]: [...(prev[commId] ?? []), created] }));
        setNewMilestoneLabel((prev) => ({ ...prev, [commId]: '' }));
        setNewMilestoneDate((prev) => ({ ...prev, [commId]: '' }));
      })
      .catch(console.error);
  }

  // Deliberately not a hardcoded cap (was fixed at 3) — the count of asks the org actually
  // plans for a given year can change, and this badge is informational, not a warning system:
  // we track asks to stay mindful of the relationship, not to enforce a strict limit.
  const asksSent = comms.filter((c) => c.is_financial_ask && c.status === 'sent').length;
  const totalAsks = comms.filter((c) => c.is_financial_ask).length;
  const asksCounterColor = 'text-sparrow-green dark:text-sparrow-dark-green bg-sparrow-green/10';

  const todayISO = localDate();

  return (
    <div className="space-y-4">
      <div className="max-w-2xl space-y-2 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
        <p>
          A piece that isn't started yet comes up on Partnerships Home and in the reminder
          owner's tasks {NEWSLETTER_HEADS_UP_DAYS / 7} weeks before its publish date, or {NEWSLETTER_EARLY_HEADS_UP_DAYS} days
          before for the Christmas TSM, Christmas cards and the Annual Report, which need
          writers lined up early. Setting it to In progress clears the reminder.
        </p>
        {setting && (
          <div className="flex items-center gap-2">
            <span>Reminders go to</span>
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${ownerColors[setting.owner_id] ?? 'bg-sparrow-gray dark:bg-sparrow-dark-border'}`} />
            <select
              value={setting.owner_id}
              onChange={(e) => void changeReminderOwner(e.target.value)}
              className="field-input mt-0 w-auto py-1 text-sm"
            >
              {(ownerProfiles.some((p) => p.id === setting.owner_id)
                ? ownerProfiles
                : [...ownerProfiles, ...profiles.filter((p) => p.id === setting.owner_id)]
              ).map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Header: year nav + ask counter */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setYear((y) => y - 1)}
            className="rounded-lg px-2 py-1.5 text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2 hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink"
          >
            ←
          </button>
          <span className="min-w-[64px] text-center text-sm font-semibold text-sparrow-ink dark:text-sparrow-dark-ink">
            {year}
          </span>
          <button
            onClick={() => setYear((y) => y + 1)}
            className="rounded-lg px-2 py-1.5 text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2 hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink"
          >
            →
          </button>
        </div>

        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${asksCounterColor}`}>
          {asksSent} of {totalAsks} financial asks sent
        </span>
      </div>

      {loading && (
        <p className="py-8 text-center text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Loading…</p>
      )}

      {!loading && comms.length === 0 && (
        <p className="rounded-xl border border-dashed border-sparrow-rule dark:border-sparrow-dark-border p-8 text-center text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
          No comms entries for {year}.
        </p>
      )}

      {!loading && comms.length > 0 && (
        <ul className="divide-y divide-sparrow-rule dark:divide-sparrow-dark-border overflow-hidden rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface">
          {comms.map((comm) => {
            const expanded = expandedId === comm.id;
            const warn = newsletterReminderDue(comm, todayISO) && comm.publish_date >= todayISO;
            const isPast = comm.publish_date < todayISO;

            return (
              <li key={comm.id}>
                {/* Row */}
                <button
                  onClick={() => setExpandedId(expanded ? null : comm.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2"
                >
                  <span className="w-14 shrink-0 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                    {shortDate(comm.publish_date)}
                  </span>

                  <span className={`flex-1 text-sm font-medium ${isPast && comm.status !== 'sent' ? 'text-sparrow-gray dark:text-sparrow-dark-gray' : 'text-sparrow-ink dark:text-sparrow-dark-ink'}`}>
                    {comm.title}
                  </span>

                  <span className="flex items-center gap-2">
                    {comm.is_financial_ask && (
                      <span className="rounded-full bg-sparrow-gold/20 px-2 py-0.5 text-[10px] font-medium text-sparrow-ink dark:text-sparrow-dark-ink">
                        Ask
                      </span>
                    )}
                    {warn && (
                      <span
                        title={needsAdvanceNotice(comm.comm_type) ? 'Needs writer assignment + advance coordination — not yet started' : `Publish date within ${newsletterHeadsUpDays(comm.comm_type)} days — not yet started`}
                        className="text-amber-500 text-sm"
                      >
                        ⚠
                      </span>
                    )}
                    {/* A dropdown, not a click-to-cycle chip, so one extra click can't mark a piece Sent. */}
                    <select
                      value={comm.status}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      onChange={(e) => handleStatusChange(comm, e.target.value as CommStatus)}
                      className={`cursor-pointer appearance-none rounded-full border-0 px-2 py-0.5 text-[10px] font-medium ${STATUS_CHIP[comm.status]}`}
                    >
                      {STATUS_CYCLE.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                    <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{expanded ? '▲' : '▼'}</span>
                  </span>
                </button>

                {/* Accordion */}
                {expanded && (
                  <div className="border-t border-sparrow-rule dark:border-sparrow-dark-border bg-sparrow-mist/30 dark:bg-sparrow-dark-surface2 px-4 py-4 space-y-4">
                    {/* Status selector */}
                    <div>
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">
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
                                : 'bg-white dark:bg-sparrow-dark-surface border border-sparrow-rule dark:border-sparrow-dark-border text-sparrow-gray dark:text-sparrow-dark-gray hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2'
                            }`}
                          >
                            {STATUS_LABEL[s]}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">
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

                    {/* Production milestones — TSM/Spotlight start with a 6-step checklist;
                        everything else starts empty. Add/remove freely either way. */}
                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">
                        Production milestones
                      </p>
                      {(milestonesByComm[comm.id] ?? []).length === 0 && (
                        <p className="mb-2 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                          No milestones yet — add the steps this piece needs below.
                        </p>
                      )}
                      {(milestonesByComm[comm.id] ?? []).length > 0 && (
                        <ul className="space-y-1.5">
                          {(milestonesByComm[comm.id] ?? []).map((m) => {
                            const done = !!m.completed_at;
                            const isPastMilestone = m.due_date < todayISO;
                            return (
                              <li
                                key={m.id}
                                className={`flex flex-wrap items-center gap-2 text-sm ${done ? 'text-sparrow-gray/50' : isPastMilestone ? 'text-sparrow-gray/60' : 'text-sparrow-ink dark:text-sparrow-dark-ink'}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => toggleMilestoneDone(comm.id, m)}
                                  aria-label={done ? `Mark "${m.label}" not done` : `Mark "${m.label}" done`}
                                  className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[9px] leading-none ${
                                    done
                                      ? 'border-sparrow-green bg-sparrow-green text-white'
                                      : isPastMilestone
                                        ? 'border-sparrow-rule dark:border-sparrow-dark-border'
                                        : 'border-sparrow-green'
                                  }`}
                                >
                                  {done ? '✓' : ''}
                                </button>
                                <input
                                  type="date"
                                  value={m.due_date}
                                  onChange={(e) => handleMilestoneChange(comm.id, m.id, { due_date: e.target.value })}
                                  className="field-input mt-0 w-36 py-1 text-xs"
                                />
                                <span className={`flex-1 ${done ? 'line-through' : ''}`}>{m.label}</span>
                                <select
                                  value={m.owner_id ?? ''}
                                  onChange={(e) => handleMilestoneChange(comm.id, m.id, { owner_id: e.target.value || null })}
                                  className="field-input mt-0 py-1 text-xs"
                                >
                                  <option value="">Unassigned</option>
                                  {ownerProfiles.map((op) => (
                                    <option key={op.id} value={op.id}>{op.full_name}</option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMilestone(comm.id, m.id)}
                                  aria-label={`Remove "${m.label}"`}
                                  className="shrink-0 text-sparrow-gray hover:text-priority-p1 dark:text-sparrow-dark-gray"
                                >
                                  ✕
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          placeholder="New milestone…"
                          value={newMilestoneLabel[comm.id] ?? ''}
                          onChange={(e) => setNewMilestoneLabel((prev) => ({ ...prev, [comm.id]: e.target.value }))}
                          className="field-input mt-0 min-w-[160px] flex-1 py-1 text-xs"
                        />
                        <input
                          type="date"
                          value={newMilestoneDate[comm.id] ?? ''}
                          onChange={(e) => setNewMilestoneDate((prev) => ({ ...prev, [comm.id]: e.target.value }))}
                          className="field-input mt-0 w-36 py-1 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddMilestone(comm.id)}
                          className="btn-secondary py-1 text-xs"
                        >
                          + Add
                        </button>
                      </div>
                    </div>

                    {/* December note */}
                    {(comm.comm_type === 'tsm_christmas' || comm.comm_type === 'christmas_cards') && (
                      <p className="rounded-lg border border-sparrow-gold/30 bg-sparrow-gold/5 px-3 py-2 text-xs text-sparrow-ink dark:text-sparrow-dark-ink">
                        The Executive Director &amp; Director of LCP write the founders' Christmas greeting this month.
                        Give minimum 2 weeks notice — ideally calendared months in advance.
                      </p>
                    )}

                    {/* January note */}
                    {comm.comm_type === 'annual_report' && (
                      <p className="rounded-lg border border-sparrow-gold/30 bg-sparrow-gold/5 px-3 py-2 text-xs text-sparrow-ink dark:text-sparrow-dark-ink">
                        The Executive Director and Director of LCP each write a leadership letter in January (separately —
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
