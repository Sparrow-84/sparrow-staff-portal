import { useCallback, useEffect, useState } from 'react';
import {
  AREA_LABEL,
  FAMILY_STATUS,
  HOMEWORK_AREAS,
  TOTAL_SESSIONS,
  type CurriculumSession,
  type Family,
  type FamilyStatus,
  type Homework,
  type HomeworkArea,
  type Message,
  type Redemption,
  type StaffNote,
  type Voucher,
} from '@/lib/lcp-types';
import {
  addStaffNote,
  updateStaffNote,
  assignHomework,
  awardVoucher,
  deleteFamily,
  deleteHomework,
  fetchHomeworkForFamily,
  fetchMessages,
  fetchRedemptions,
  fetchStaffNotes,
  fetchVouchers,
  fulfillRedemption,
  sendStaffMessage,
  setFamilyActive,
  setHomeworkStatus,
  updateFamily,
} from '@/lib/lcp';
import { money, dayLabel, dueLabel, isOverdue } from '@/lib/lcp-format';
import { Drawer } from './Drawer';
import { StaffThread } from './StaffThread';

type Tab = 'progress' | 'homework' | 'messages' | 'notes' | 'rewards';
const TABS: { key: Tab; label: string }[] = [
  { key: 'progress', label: 'Progress' },
  { key: 'homework', label: 'Homework' },
  { key: 'messages', label: 'Messages' },
  { key: 'notes', label: 'Notes' },
  { key: 'rewards', label: 'Rewards' },
];

export function FamilyDetailPanel({
  open,
  family,
  sessions,
  currentUserId,
  onClose,
  onChanged,
}: {
  open: boolean;
  family: Family | null;
  sessions: CurriculumSession[];
  currentUserId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<Tab>('progress');
  const [homework, setHomework] = useState<Homework[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [notes, setNotes] = useState<StaffNote[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);

  const familyId = family?.id;

  const reloadDetail = useCallback(async () => {
    if (!familyId) return;
    const [hw, msg, nt, vo, red] = await Promise.all([
      fetchHomeworkForFamily(familyId),
      fetchMessages(familyId),
      fetchStaffNotes(familyId),
      fetchVouchers(familyId),
      fetchRedemptions(),
    ]);
    setHomework(hw);
    setMessages(msg);
    setNotes(nt);
    setVouchers(vo);
    setRedemptions(red.filter((r) => r.family_id === familyId));
  }, [familyId]);

  useEffect(() => {
    if (open && familyId) {
      setTab('progress');
      void reloadDetail();
    }
  }, [open, familyId, reloadDetail]);

  if (!family) return null;

  return (
    <Drawer open={open} onClose={onClose} title={family.display_name} subtitle={family.login_email}>
      <div className="mb-4 inline-flex rounded-xl border border-sparrow-rule bg-sparrow-mist p-1 text-xs">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-2.5 py-1.5 font-medium transition ${
              tab === t.key ? 'bg-white text-sparrow-green shadow-sm' : 'text-sparrow-gray hover:text-sparrow-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'progress' && (
        <ProgressTab
          family={family}
          sessions={sessions}
          onChanged={onChanged}
          onRemoved={() => {
            onChanged();
            onClose();
          }}
        />
      )}
      {tab === 'homework' && (
        <HomeworkTab
          family={family}
          homework={homework}
          sessions={sessions}
          currentUserId={currentUserId}
          onChanged={() => {
            void reloadDetail();
            onChanged();
          }}
        />
      )}
      {tab === 'messages' && (
        <div className="h-[60vh]">
          <StaffThread
            messages={messages}
            onSend={async (body) => {
              await sendStaffMessage(family.id, body, currentUserId);
              await reloadDetail();
            }}
          />
        </div>
      )}
      {tab === 'notes' && (
        <NotesTab family={family} notes={notes} currentUserId={currentUserId} onChanged={reloadDetail} />
      )}
      {tab === 'rewards' && (
        <RewardsTab
          family={family}
          vouchers={vouchers}
          redemptions={redemptions}
          currentUserId={currentUserId}
          onChanged={() => {
            void reloadDetail();
            onChanged();
          }}
        />
      )}
    </Drawer>
  );
}

// ── Progress ─────────────────────────────────────────────────────────
function ProgressTab({
  family,
  sessions,
  onChanged,
  onRemoved,
}: {
  family: Family;
  sessions: CurriculumSession[];
  onChanged: () => void;
  onRemoved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const current = sessions.find((s) => s.session_number === family.current_session_number);
  const pct = Math.round((family.current_session_number / TOTAL_SESSIONS) * 100);

  async function setSession(n: number) {
    const clamped = Math.max(1, Math.min(TOTAL_SESSIONS, n));
    setBusy(true);
    await updateFamily(family.id, { current_session_number: clamped });
    setBusy(false);
    onChanged();
  }
  async function setStatus(status: FamilyStatus) {
    setBusy(true);
    await updateFamily(family.id, { status });
    setBusy(false);
    onChanged();
  }
  async function bumpHousing(deltaCents: number) {
    const next = Math.max(0, Math.min(120_000, family.housing_savings_cents + deltaCents));
    setBusy(true);
    await updateFamily(family.id, { housing_savings_cents: next });
    setBusy(false);
    onChanged();
  }
  async function cancelParticipation() {
    setBusy(true);
    setErr(null);
    try {
      await setFamilyActive(family.id, false);
      onRemoved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not cancel participation.');
      setBusy(false);
    }
  }
  async function removeForever() {
    setBusy(true);
    setErr(null);
    try {
      await deleteFamily(family.id);
      onRemoved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not delete the family.');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-sparrow-gold">Building Your House</p>
        <p className="font-serif text-lg font-semibold text-sparrow-green">
          {current?.unit?.phase?.name ?? '—'}
        </p>
        <p className="text-sm text-sparrow-gray">
          {current?.unit?.name ? `${current.unit.name} · ` : ''}Session {family.current_session_number} of{' '}
          {TOTAL_SESSIONS}
        </p>
        <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-sparrow-sage">
          <div className="h-full rounded-full bg-sparrow-green" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="field-label flex-1">Advance / rewind</span>
        <button disabled={busy} onClick={() => setSession(family.current_session_number - 1)} className="btn-ghost border border-sparrow-rule">
          − Unit
        </button>
        <button disabled={busy} onClick={() => setSession(family.current_session_number + 1)} className="btn-primary">
          + Unit
        </button>
      </div>

      <div>
        <span className="field-label">Status</span>
        <div className="mt-1 flex flex-wrap gap-2">
          {(Object.keys(FAMILY_STATUS) as FamilyStatus[]).map((s) => (
            <button
              key={s}
              disabled={busy}
              onClick={() => setStatus(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                family.status === s ? FAMILY_STATUS[s].chip : 'bg-sparrow-mist text-sparrow-gray'
              }`}
            >
              {FAMILY_STATUS[s].label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-sparrow-cream p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-sparrow-ink">🏡 Housing savings</span>
          <span className="font-serif text-lg font-semibold text-sparrow-green">
            {money(family.housing_savings_cents)}
          </span>
        </div>
        <div className="mt-2 flex gap-2">
          <button disabled={busy} onClick={() => bumpHousing(-10_000)} className="btn-ghost border border-sparrow-rule">
            − $100
          </button>
          <button disabled={busy} onClick={() => bumpHousing(10_000)} className="btn-ghost border border-sparrow-rule">
            + $100 (perfect month)
          </button>
        </div>
      </div>

      <div className="border-t border-sparrow-rule pt-4">
        <span className="field-label">Participation</span>
        <p className="mt-1 text-xs text-sparrow-gray">
          Cancelling removes {family.display_name} from the active roster but keeps their records.
          Deleting erases everything permanently.
        </p>

        <div className="mt-2">
          {!confirmCancel ? (
            <button
              disabled={busy}
              onClick={() => {
                setConfirmDelete(false);
                setConfirmCancel(true);
              }}
              className="btn-ghost border border-sparrow-rule"
            >
              Cancel participation
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-sparrow-ink">Remove from the active roster?</span>
              <button disabled={busy} onClick={cancelParticipation} className="btn-primary">
                {busy ? 'Working…' : 'Yes, cancel'}
              </button>
              <button disabled={busy} onClick={() => setConfirmCancel(false)} className="btn-ghost">
                Keep active
              </button>
            </div>
          )}
        </div>

        <div className="mt-2">
          {!confirmDelete ? (
            <button
              disabled={busy}
              onClick={() => {
                setConfirmCancel(false);
                setConfirmDelete(true);
              }}
              className="text-xs text-sparrow-gray underline hover:text-priority-p1"
            >
              Delete permanently…
            </button>
          ) : (
            <div className="rounded-lg border border-priority-p1/30 bg-priority-p1/5 p-3">
              <p className="text-xs text-priority-p1">
                Permanently delete {family.display_name} and all their homework, attendance,
                messages, notes, and vouchers? This can't be undone. If they already created a
                login, an admin must remove it in Supabase separately.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  disabled={busy}
                  onClick={removeForever}
                  className="rounded-lg bg-priority-p1 px-3 py-1.5 text-sm font-medium text-white"
                >
                  {busy ? 'Deleting…' : 'Delete permanently'}
                </button>
                <button disabled={busy} onClick={() => setConfirmDelete(false)} className="btn-ghost">
                  Keep
                </button>
              </div>
            </div>
          )}
        </div>

        {err && <p className="mt-2 text-sm text-priority-p1">{err}</p>}
      </div>
    </div>
  );
}

// ── Homework ─────────────────────────────────────────────────────────
function HomeworkTab({
  family,
  homework,
  sessions,
  currentUserId,
  onChanged,
}: {
  family: Family;
  homework: Homework[];
  sessions: CurriculumSession[];
  currentUserId: string;
  onChanged: () => void;
}) {
  const [title, setTitle] = useState('');
  const [area, setArea] = useState<HomeworkArea>('general');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!title.trim()) return;
    setBusy(true);
    await assignHomework(
      {
        family_id: family.id,
        session_id: family.current_session_number
          ? sessions.find((s) => s.session_number === family.current_session_number)?.id ?? null
          : null,
        area,
        title: title.trim(),
        description: null,
        due_date: due || null,
      },
      currentUserId,
    );
    setTitle('');
    setDue('');
    setArea('general');
    setBusy(false);
    onChanged();
  }

  async function toggle(hw: Homework) {
    await setHomeworkStatus(hw.id, hw.status === 'complete' ? 'assigned' : 'complete');
    onChanged();
  }
  async function remove(id: string) {
    await deleteHomework(id);
    onChanged();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-sparrow-rule p-3">
        <span className="field-label">Assign homework</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What should they do this week?"
          className="field-input"
        />
        <div className="mt-2 flex gap-2">
          <select value={area} onChange={(e) => setArea(e.target.value as HomeworkArea)} className="field-input mt-0 flex-1">
            {HOMEWORK_AREAS.map((a) => (
              <option key={a} value={a}>
                {AREA_LABEL[a]}
              </option>
            ))}
          </select>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="field-input mt-0" />
          <button onClick={add} disabled={busy || !title.trim()} className="btn-primary shrink-0">
            Add
          </button>
        </div>
      </div>

      <ul className="space-y-2">
        {homework.length === 0 && <li className="text-sm text-sparrow-gray">No homework assigned.</li>}
        {homework.map((hw) => (
          <li key={hw.id} className={`flex items-start gap-2 rounded-xl border p-3 ${
            hw.status !== 'complete' && isOverdue(hw.due_date)
              ? 'border-priority-p1/30 bg-priority-p1/5'
              : 'border-sparrow-rule/70'
          }`}>
            <button
              onClick={() => toggle(hw)}
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 text-white ${
                hw.status === 'complete' ? 'border-sparrow-green bg-sparrow-green' : 'border-sparrow-rule'
              }`}
              aria-label="Toggle complete"
            >
              {hw.status === 'complete' && '✓'}
            </button>
            <div className="min-w-0 flex-1">
              <p className={`text-sm ${hw.status === 'complete' ? 'text-sparrow-gray line-through' : 'text-sparrow-ink'}`}>
                {hw.title}
              </p>
              <p className={`text-xs ${hw.status !== 'complete' && isOverdue(hw.due_date) ? 'text-priority-p1' : 'text-sparrow-gray'}`}>
                {AREA_LABEL[hw.area]} · {dueLabel(hw.due_date)}
                {hw.status === 'submitted' && ' · submitted online'}
              </p>
            </div>
            <button onClick={() => remove(hw.id)} className="text-xs text-sparrow-gray hover:text-priority-p1">
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Notes ────────────────────────────────────────────────────────────
function NotesTab({
  family,
  notes,
  currentUserId,
  onChanged,
}: {
  family: Family;
  notes: StaffNote[];
  currentUserId: string;
  onChanged: () => void;
}) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!body.trim()) return;
    setBusy(true);
    await addStaffNote(family.id, body.trim(), currentUserId);
    setBody('');
    setBusy(false);
    onChanged();
  }

  async function saveEdit(id: string) {
    if (!editBody.trim()) return;
    setSaving(true);
    await updateStaffNote(id, editBody.trim());
    setEditingId(null);
    setSaving(false);
    onChanged();
  }

  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-sparrow-cream px-3 py-2 text-xs text-sparrow-ink">
        🔒 Internal — never visible to the family or to non-LCP staff.
      </p>
      <div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Add a note for the LCP team…"
          className="field-input"
        />
        <button onClick={add} disabled={busy || !body.trim()} className="btn-primary mt-2">
          Add note
        </button>
      </div>
      <ul className="space-y-2">
        {notes.length === 0 && <li className="text-sm text-sparrow-gray">No notes yet.</li>}
        {notes.map((n) => (
          <li key={n.id} className="rounded-xl border border-sparrow-rule/70 p-3">
            {editingId === n.id ? (
              <div className="space-y-2">
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={3}
                  className="field-input"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => saveEdit(n.id)}
                    disabled={saving || !editBody.trim()}
                    className="btn-primary text-xs"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    disabled={saving}
                    className="btn-ghost text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm text-sparrow-ink">{n.body}</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-xs text-sparrow-gray">
                    {n.updated_at && n.updated_at !== n.created_at
                      ? `Edited ${dayLabel(n.updated_at)}`
                      : dayLabel(n.created_at)}
                    {n.author_name && ` · ${n.author_name}`}
                  </p>
                  {n.author_id === currentUserId && (
                    <button
                      onClick={() => { setEditingId(n.id); setEditBody(n.body); }}
                      className="text-xs text-sparrow-gray hover:text-sparrow-green"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Rewards ──────────────────────────────────────────────────────────
function RewardsTab({
  family,
  vouchers,
  redemptions,
  currentUserId,
  onChanged,
}: {
  family: Family;
  vouchers: Voucher[];
  redemptions: Redemption[];
  currentUserId: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const unspent = vouchers.filter((v) => !v.redemption_id).length;
  const pending = redemptions.filter((r) => r.status === 'requested');

  async function award() {
    setBusy(true);
    await awardVoucher(family.id, 'On-time attendance + homework', currentUserId);
    setBusy(false);
    onChanged();
  }
  async function fulfill(r: Redemption) {
    setBusy(true);
    await fulfillRedemption(r.id, family.id, r.vouchers_spent, currentUserId);
    setBusy(false);
    onChanged();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl bg-sparrow-mist p-4">
        <div>
          <p className="font-serif text-2xl font-semibold text-sparrow-green">{unspent}</p>
          <p className="text-xs text-sparrow-gray">unspent vouchers</p>
        </div>
        <button onClick={award} disabled={busy} className="btn-primary">
          + Award voucher
        </button>
      </div>

      {pending.length > 0 && (
        <div>
          <span className="field-label">Redemption requests</span>
          <ul className="mt-1 space-y-2">
            {pending.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-xl border border-sparrow-gold/40 bg-sparrow-cream p-3">
                <span className="text-sm">
                  {money(r.gift_card_value_cents)} gift card · {r.vouchers_spent} vouchers
                </span>
                <button onClick={() => fulfill(r)} disabled={busy} className="btn-primary">
                  Mark gift card given
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
