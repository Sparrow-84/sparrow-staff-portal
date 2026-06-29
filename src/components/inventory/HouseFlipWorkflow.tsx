import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/auth/AuthContext';
import {
  startHouseFlip,
  fetchActiveFlipForLocation,
  fetchFlipItemChecks,
  setItemChecked,
  confirmMissingAndAdvance,
  fetchFlipLeaveBehinds,
  addLeaveBehind,
  deleteLeaveBehind,
  advanceFlipStatus,
  approveFlipForPurchasing,
  fetchFlipNewItems,
  addFlipNewItem,
  deleteFlipNewItem,
  submitHouseFlip,
  fetchSubLocations,
} from '@/lib/inventory';
import {
  BATCH_CATEGORIES, BATCH_CATEGORY_HINTS,
  type InvHouseFlip, type InvFlipItemCheck,
  type InvFlipLeaveBehind, type InvFlipNewItem, type InvSubLocation,
} from '@/lib/inventory-types';

// ── Types ─────────────────────────────────────────────────────────────────

type LocalStep =
  | 'loading'
  | 'no_flip'
  | 'walkthrough'
  | 'confirm_missing'
  | 'leave_behinds'
  | 'pending_shelly'
  | 'purchasing'
  | 'new_items'
  | 'submitted';

// ── Main component ────────────────────────────────────────────────────────

export function HouseFlipWorkflow({
  locationId,
  locationName,
  onBack,
}: {
  locationId: string;
  locationName: string;
  onBack: () => void;
}) {
  const { profile } = useAuth();
  const canApprove = profile?.ops_access ?? false;

  const [step,         setStep]         = useState<LocalStep>('loading');
  const [flip,         setFlip]         = useState<InvHouseFlip | null>(null);
  const [checks,       setChecks]       = useState<InvFlipItemCheck[]>([]);
  const [leaveBehinds, setLeaveBehinds] = useState<InvFlipLeaveBehind[]>([]);
  const [newItems,     setNewItems]     = useState<InvFlipNewItem[]>([]);
  const [subLocs,      setSubLocs]      = useState<InvSubLocation[]>([]);
  const [err,          setErr]          = useState('');
  const [saving,       setSaving]       = useState(false);

  // ── Load existing flip ──────────────────────────────────────────────────

  const loadFlip = useCallback(async () => {
    setErr('');
    try {
      const existing = await fetchActiveFlipForLocation(locationId);
      if (!existing) {
        setFlip(null);
        setStep('no_flip');
        return;
      }
      setFlip(existing);
      const [sls] = await Promise.all([fetchSubLocations(locationId)]);
      setSubLocs(sls);

      if (existing.status === 'walkthrough') {
        const c = await fetchFlipItemChecks(existing.id);
        setChecks(c);
        setStep('walkthrough');
      } else if (existing.status === 'leave_behinds') {
        const [c, lb] = await Promise.all([
          fetchFlipItemChecks(existing.id),
          fetchFlipLeaveBehinds(existing.id),
        ]);
        setChecks(c);
        setLeaveBehinds(lb);
        setStep('leave_behinds');
      } else if (existing.status === 'pending_shelly') {
        const [c, lb] = await Promise.all([
          fetchFlipItemChecks(existing.id),
          fetchFlipLeaveBehinds(existing.id),
        ]);
        setChecks(c);
        setLeaveBehinds(lb);
        setStep('pending_shelly');
      } else if (existing.status === 'purchasing') {
        setStep('purchasing');
      } else if (existing.status === 'new_items') {
        const ni = await fetchFlipNewItems(existing.id);
        setNewItems(ni);
        setStep('new_items');
      } else if (existing.status === 'submitted') {
        setStep('submitted');
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load flip data.');
      setStep('no_flip');
    }
  }, [locationId]);

  useEffect(() => { void loadFlip(); }, [loadFlip]);

  // ── Start flip ─────────────────────────────────────────────────────────

  async function handleStart() {
    setSaving(true);
    setErr('');
    try {
      const newFlip = await startHouseFlip(locationId);
      setFlip(newFlip);
      const [c, sls] = await Promise.all([
        fetchFlipItemChecks(newFlip.id),
        fetchSubLocations(locationId),
      ]);
      setChecks(c);
      setSubLocs(sls);
      setStep('walkthrough');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not start flip.');
    } finally {
      setSaving(false);
    }
  }

  // ── Screen router ──────────────────────────────────────────────────────

  if (step === 'loading') {
    return (
      <div className="flex items-center justify-center h-40 text-sparrow-gray text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* Back header */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={onBack}
          className="text-sm text-sparrow-gray hover:text-sparrow-ink transition"
        >
          ← Back
        </button>
        <span className="text-sparrow-rule">|</span>
        <span className="text-sm font-medium text-sparrow-ink">{locationName} — House Flip</span>
      </div>

      {err && <p className="mb-4 text-sm text-priority-p1">{err}</p>}

      {step === 'no_flip'       && <StartScreen onStart={handleStart} saving={saving} locationName={locationName} />}
      {step === 'walkthrough'   && flip && (
        <WalkthroughScreen
          flip={flip}
          checks={checks}
          setChecks={setChecks}
          onDoneWalking={() => {
            const unchecked = checks.filter((c) => !c.checked_present);
            if (unchecked.length === 0) {
              void handleConfirmMissing([]);
            } else {
              setStep('confirm_missing');
            }
          }}
        />
      )}
      {step === 'confirm_missing' && flip && (
        <ConfirmMissingScreen
          checks={checks}
          setChecks={setChecks}
          onConfirm={(missingIds) => handleConfirmMissing(missingIds)}
          onBack={() => setStep('walkthrough')}
          saving={saving}
        />
      )}
      {step === 'leave_behinds' && flip && (
        <LeaveBehindScreen
          flip={flip}
          leaveBehinds={leaveBehinds}
          setLeaveBehinds={setLeaveBehinds}
          subLocs={subLocs}
          onContinue={handleAdvanceToShellyReview}
          saving={saving}
        />
      )}
      {step === 'pending_shelly' && flip && (
        <ShellyReviewScreen
          flip={flip}
          checks={checks}
          leaveBehinds={leaveBehinds}
          canApprove={canApprove}
          onApprove={handleApprove}
          saving={saving}
        />
      )}
      {step === 'purchasing' && flip && (
        <PurchasingScreen
          flip={flip}
          onReadyToLog={handleAdvanceToNewItems}
          saving={saving}
        />
      )}
      {step === 'new_items' && flip && (
        <NewItemsScreen
          flip={flip}
          newItems={newItems}
          setNewItems={setNewItems}
          subLocs={subLocs}
          onSubmit={handleSubmit}
          saving={saving}
        />
      )}
      {step === 'submitted' && <SubmittedScreen locationName={locationName} onBack={onBack} />}
    </div>
  );

  // ── Step handlers ──────────────────────────────────────────────────────

  async function handleConfirmMissing(missingIds: string[]) {
    if (!flip) return;
    setSaving(true);
    setErr('');
    try {
      await confirmMissingAndAdvance(flip.id, missingIds);
      const [updatedFlip, lb] = await Promise.all([
        fetchActiveFlipForLocation(locationId),
        fetchFlipLeaveBehinds(flip.id),
      ]);
      if (updatedFlip) setFlip(updatedFlip);
      setLeaveBehinds(lb);
      setStep('leave_behinds');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not confirm missing items.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAdvanceToShellyReview() {
    if (!flip) return;
    setSaving(true);
    setErr('');
    try {
      await advanceFlipStatus(flip.id, 'pending_shelly');
      setStep('pending_shelly');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not advance to review step.');
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(notes: string) {
    if (!flip) return;
    setSaving(true);
    setErr('');
    try {
      await approveFlipForPurchasing(flip.id, notes);
      setStep('purchasing');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not approve.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAdvanceToNewItems() {
    if (!flip) return;
    setSaving(true);
    setErr('');
    try {
      await advanceFlipStatus(flip.id, 'new_items');
      setStep('new_items');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not advance.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    if (!flip) return;
    setSaving(true);
    setErr('');
    try {
      await submitHouseFlip(flip.id);
      setStep('submitted');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not submit.');
    } finally {
      setSaving(false);
    }
  }
}

// ── Step screens ──────────────────────────────────────────────────────────

function StartScreen({
  locationName,
  onStart,
  saving,
}: {
  locationName: string;
  onStart: () => void;
  saving: boolean;
}) {
  return (
    <div className="rounded-xl border border-sparrow-rule bg-white p-6 text-center space-y-4">
      <div>
        <h2 className="font-serif text-xl font-semibold text-sparrow-ink">
          Start House Flip
        </h2>
        <p className="text-sm text-sparrow-gray mt-1">{locationName}</p>
      </div>
      <p className="text-sm text-sparrow-gray max-w-sm mx-auto">
        This workflow walks you through an inventory audit before a new resident moves in.
        You'll walk the house, log what was left behind, get supervisor sign-off, then record what came in.
      </p>
      <button
        onClick={onStart}
        disabled={saving}
        className="rounded-lg bg-sparrow-green px-6 py-2.5 text-sm font-medium text-white hover:bg-sparrow-green/90 transition disabled:opacity-50"
      >
        {saving ? 'Starting…' : 'Start house flip'}
      </button>
    </div>
  );
}

// ── Walkthrough ────────────────────────────────────────────────────────────

function WalkthroughScreen({
  checks,
  setChecks,
  onDoneWalking,
}: {
  flip: InvHouseFlip;
  checks: InvFlipItemCheck[];
  setChecks: React.Dispatch<React.SetStateAction<InvFlipItemCheck[]>>;
  onDoneWalking: () => void;
}) {
  const [toggling, setToggling] = useState<string | null>(null);

  async function handleToggle(check: InvFlipItemCheck) {
    setToggling(check.id);
    try {
      const next = !check.checked_present;
      await setItemChecked(check.id, next);
      setChecks((prev) =>
        prev.map((c) => c.id === check.id ? { ...c, checked_present: next } : c),
      );
    } finally {
      setToggling(null);
    }
  }

  // Group by sub-location name
  const grouped = checks.reduce<Record<string, InvFlipItemCheck[]>>((acc, c) => {
    const key = c.item?.sub_location?.name ?? 'No sub-location';
    (acc[key] = acc[key] ?? []).push(c);
    return acc;
  }, {});

  const checkedCount   = checks.filter((c) => c.checked_present).length;
  const uncheckedCount = checks.length - checkedCount;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-xl font-semibold text-sparrow-ink">Walk the House</h2>
        <p className="text-sm text-sparrow-gray mt-1">
          Check off each item as you see it. Anything not checked will be flagged as potentially missing.
        </p>
      </div>

      {checks.length === 0 ? (
        <div className="rounded-xl border border-sparrow-rule bg-sparrow-mist p-5 text-center">
          <p className="text-sm text-sparrow-gray">No items on file for this house yet.</p>
          <p className="text-xs text-sparrow-gray mt-1">
            You can still proceed to log leave-behinds and new items.
          </p>
        </div>
      ) : (
        <>
          <div className="text-xs text-sparrow-gray">
            {checkedCount} of {checks.length} checked
            {uncheckedCount > 0 && ` · ${uncheckedCount} not yet seen`}
          </div>
          <div className="space-y-3">
            {Object.entries(grouped).map(([groupName, groupChecks]) => (
              <div key={groupName} className="rounded-xl border border-sparrow-rule bg-white overflow-hidden">
                <div className="border-b border-sparrow-rule px-4 py-2 bg-sparrow-mist">
                  <p className="text-xs font-semibold text-sparrow-gray uppercase tracking-wide">
                    {groupName}
                  </p>
                </div>
                <ul className="divide-y divide-sparrow-rule">
                  {groupChecks.map((c) => (
                    <li key={c.id}>
                      <button
                        onClick={() => handleToggle(c)}
                        disabled={toggling === c.id}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition ${
                          c.checked_present ? 'bg-sparrow-green/5' : 'hover:bg-sparrow-mist'
                        }`}
                      >
                        <span className={`shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center transition ${
                          c.checked_present
                            ? 'border-sparrow-green bg-sparrow-green'
                            : 'border-sparrow-rule'
                        }`}>
                          {c.checked_present && (
                            <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
                              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </span>
                        <span className={`text-sm ${c.checked_present ? 'text-sparrow-gray line-through' : 'text-sparrow-ink'}`}>
                          {c.item?.description ?? 'Unknown item'}
                        </span>
                        {c.item?.is_batch && c.item.quantity > 1 && (
                          <span className="ml-auto text-xs text-sparrow-gray shrink-0">
                            ×{c.item.quantity}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}

      <button
        onClick={onDoneWalking}
        className="w-full rounded-lg bg-sparrow-green px-4 py-2.5 text-sm font-medium text-white hover:bg-sparrow-green/90 transition"
      >
        Done walking →
      </button>
    </div>
  );
}

// ── Confirm missing ────────────────────────────────────────────────────────

function ConfirmMissingScreen({
  checks,
  setChecks,
  onConfirm,
  onBack,
  saving,
}: {
  checks: InvFlipItemCheck[];
  setChecks: React.Dispatch<React.SetStateAction<InvFlipItemCheck[]>>;
  onConfirm: (missingIds: string[]) => void;
  onBack: () => void;
  saving: boolean;
}) {
  const unchecked = checks.filter((c) => !c.checked_present);
  // Local resolved state: null = unresolved, true = missing, false = found
  const [resolved, setResolved] = useState<Record<string, boolean | null>>(
    () => Object.fromEntries(unchecked.map((c) => [c.id, null])),
  );

  function markMissing(id: string) {
    setResolved((r) => ({ ...r, [id]: true }));
  }

  function markFound(id: string) {
    setResolved((r) => ({ ...r, [id]: false }));
    setChecks((prev) =>
      prev.map((c) => c.id === id ? { ...c, checked_present: true } : c),
    );
  }

  const allResolved = unchecked.every((c) => resolved[c.id] !== null);
  const missingIds  = unchecked.filter((c) => resolved[c.id] === true).map((c) => c.id);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-xl font-semibold text-sparrow-ink">Verify Missing Items</h2>
        <p className="text-sm text-sparrow-gray mt-1">
          These items weren't checked off. Confirm each one is no longer in the house, or mark it as found.
        </p>
      </div>

      <div className="rounded-xl border border-sparrow-rule bg-white overflow-hidden">
        <ul className="divide-y divide-sparrow-rule">
          {unchecked.map((c) => {
            const state = resolved[c.id];
            return (
              <li key={c.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-sparrow-ink">{c.item?.description ?? 'Unknown item'}</p>
                    {c.item?.sub_location && (
                      <p className="text-xs text-sparrow-gray mt-0.5">{c.item.sub_location.name}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => markFound(c.id)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition ${
                        state === false
                          ? 'bg-sparrow-green text-white border-sparrow-green'
                          : 'border-sparrow-rule text-sparrow-gray hover:border-sparrow-green hover:text-sparrow-green'
                      }`}
                    >
                      Found it
                    </button>
                    <button
                      onClick={() => markMissing(c.id)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition ${
                        state === true
                          ? 'bg-priority-p1 text-white border-priority-p1'
                          : 'border-sparrow-rule text-sparrow-gray hover:border-priority-p1 hover:text-priority-p1'
                      }`}
                    >
                      Confirm missing
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 rounded-lg border border-sparrow-rule px-4 py-2.5 text-sm text-sparrow-gray hover:bg-sparrow-mist transition"
        >
          ← Back to walkthrough
        </button>
        <button
          onClick={() => onConfirm(missingIds)}
          disabled={!allResolved || saving}
          className="flex-1 rounded-lg bg-sparrow-green px-4 py-2.5 text-sm font-medium text-white hover:bg-sparrow-green/90 transition disabled:opacity-50"
        >
          {saving ? 'Saving…' : `Continue${missingIds.length > 0 ? ` (${missingIds.length} missing)` : ''}`}
        </button>
      </div>
    </div>
  );
}

// ── Leave-behinds ──────────────────────────────────────────────────────────

function LeaveBehindScreen({
  flip,
  leaveBehinds,
  setLeaveBehinds,
  subLocs,
  onContinue,
  saving,
}: {
  flip: InvHouseFlip;
  leaveBehinds: InvFlipLeaveBehind[];
  setLeaveBehinds: React.Dispatch<React.SetStateAction<InvFlipLeaveBehind[]>>;
  subLocs: InvSubLocation[];
  onContinue: () => void;
  saving: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const [nothingLeft, setNothingLeft] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [formSaving, setFormSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const desc = (fd.get('description') as string).trim();
    if (!desc) { setFormErr('Description is required.'); return; }
    setFormSaving(true);
    setFormErr('');
    try {
      const lb = await addLeaveBehind(flip.id, {
        description:     desc,
        condition:       fd.get('condition') as string,
        estimated_value: fd.get('estimated_value') ? Number(fd.get('estimated_value')) : null,
        sub_location_id: (fd.get('sub_location_id') as string) || null,
        keeping:         fd.get('keeping') === 'true',
        notes:           (fd.get('notes') as string).trim() || null,
      });
      setLeaveBehinds((prev) => [...prev, lb]);
      setShowForm(false);
      formRef.current?.reset();
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setFormSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteLeaveBehind(id);
      setLeaveBehinds((prev) => prev.filter((lb) => lb.id !== id));
    } catch {
      // silent — item stays in list
    }
  }

  const canContinue = leaveBehinds.length > 0 || nothingLeft;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-xl font-semibold text-sparrow-ink">Leave-Behinds</h2>
        <p className="text-sm text-sparrow-gray mt-1">
          Log anything the outgoing resident left behind. Mark each item as kept by Sparrow or not.
        </p>
      </div>

      {/* Existing entries */}
      {leaveBehinds.length > 0 && (
        <ul className="rounded-xl border border-sparrow-rule bg-white divide-y divide-sparrow-rule overflow-hidden">
          {leaveBehinds.map((lb) => (
            <li key={lb.id} className="flex items-start gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sparrow-ink">{lb.description}</p>
                <p className="text-xs text-sparrow-gray mt-0.5">
                  {lb.condition === 'new' ? 'New' : 'Used'}
                  {lb.estimated_value ? ` · ~$${lb.estimated_value}` : ''}
                  {lb.sub_location ? ` · ${lb.sub_location.name}` : ''}
                  {' · '}
                  <span className={lb.keeping ? 'text-sparrow-green' : 'text-sparrow-gray'}>
                    {lb.keeping ? 'Keeping' : 'Not keeping'}
                  </span>
                </p>
              </div>
              <button
                onClick={() => handleDelete(lb.id)}
                className="text-xs text-sparrow-gray hover:text-priority-p1 transition shrink-0"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Add form */}
      {showForm && (
        <form
          ref={formRef}
          onSubmit={handleAdd}
          className="rounded-xl border border-sparrow-rule bg-white p-4 space-y-3"
        >
          <p className="text-sm font-medium text-sparrow-ink">Add leave-behind</p>
          {formErr && <p className="text-xs text-priority-p1">{formErr}</p>}

          <input
            name="description"
            placeholder="Description (required)"
            className="w-full rounded-lg border border-sparrow-rule px-3 py-2 text-sm focus:outline-none focus:border-sparrow-green"
          />

          <div className="grid grid-cols-2 gap-3">
            <select
              name="condition"
              defaultValue="used"
              className="rounded-lg border border-sparrow-rule px-3 py-2 text-sm focus:outline-none focus:border-sparrow-green"
            >
              <option value="new">New</option>
              <option value="used">Used</option>
            </select>
            <input
              name="estimated_value"
              type="number"
              min="0"
              step="0.01"
              placeholder="Est. value ($)"
              className="rounded-lg border border-sparrow-rule px-3 py-2 text-sm focus:outline-none focus:border-sparrow-green"
            />
          </div>

          {subLocs.length > 0 && (
            <select
              name="sub_location_id"
              className="w-full rounded-lg border border-sparrow-rule px-3 py-2 text-sm focus:outline-none focus:border-sparrow-green"
            >
              <option value="">No specific room</option>
              {subLocs.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}

          <div className="flex gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name="keeping" value="true" defaultChecked className="accent-sparrow-green" />
              Sparrow is keeping it
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name="keeping" value="false" className="accent-sparrow-green" />
              Not keeping
            </label>
          </div>

          <textarea
            name="notes"
            rows={2}
            placeholder="Notes (optional)"
            className="w-full rounded-lg border border-sparrow-rule px-3 py-2 text-sm focus:outline-none focus:border-sparrow-green resize-none"
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex-1 rounded-lg border border-sparrow-rule px-3 py-2 text-sm text-sparrow-gray hover:bg-sparrow-mist transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={formSaving}
              className="flex-1 rounded-lg bg-sparrow-green px-3 py-2 text-sm font-medium text-white hover:bg-sparrow-green/90 transition disabled:opacity-50"
            >
              {formSaving ? 'Saving…' : 'Add'}
            </button>
          </div>
        </form>
      )}

      {!showForm && (
        <button
          onClick={() => { setNothingLeft(false); setShowForm(true); }}
          className="w-full rounded-lg border border-dashed border-sparrow-rule px-4 py-2.5 text-sm text-sparrow-gray hover:border-sparrow-green/50 hover:text-sparrow-green transition"
        >
          + Add leave-behind
        </button>
      )}

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={nothingLeft}
          onChange={(e) => setNothingLeft(e.target.checked)}
          className="accent-sparrow-green"
        />
        Nothing was left behind
      </label>

      <button
        onClick={onContinue}
        disabled={!canContinue || saving}
        className="w-full rounded-lg bg-sparrow-green px-4 py-2.5 text-sm font-medium text-white hover:bg-sparrow-green/90 transition disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Send to supervisor for review →'}
      </button>
    </div>
  );
}

// ── Shelly review ──────────────────────────────────────────────────────────

function ShellyReviewScreen({
  checks,
  leaveBehinds,
  canApprove,
  onApprove,
  saving,
}: {
  flip: InvHouseFlip;
  checks: InvFlipItemCheck[];
  leaveBehinds: InvFlipLeaveBehind[];
  canApprove: boolean;
  onApprove: (notes: string) => void;
  saving: boolean;
}) {
  const [notes, setNotes] = useState('');

  const confirmed  = checks.filter((c) => c.checked_present);
  const missing    = checks.filter((c) => c.confirmed_missing);
  const keptItems  = leaveBehinds.filter((lb) => lb.keeping);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-serif text-xl font-semibold text-sparrow-ink">Supervisor Review</h2>
        <p className="text-sm text-sparrow-gray mt-1">
          Review the current state of the house and approve the shopping list before purchases are made.
        </p>
      </div>

      {/* Asset check summary */}
      <div className="rounded-xl border border-sparrow-rule bg-white overflow-hidden">
        <div className="border-b border-sparrow-rule px-4 py-2.5 bg-sparrow-mist">
          <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray">Asset Check</p>
        </div>
        <div className="px-4 py-3 grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-2xl font-semibold text-sparrow-green">{confirmed.length}</p>
            <p className="text-xs text-sparrow-gray mt-0.5">Confirmed present</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-priority-p1">{missing.length}</p>
            <p className="text-xs text-sparrow-gray mt-0.5">Confirmed missing</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-sparrow-ink">{keptItems.length}</p>
            <p className="text-xs text-sparrow-gray mt-0.5">Leave-behinds kept</p>
          </div>
        </div>
      </div>

      {/* Missing items (shopping reference) */}
      {missing.length > 0 && (
        <div className="rounded-xl border border-sparrow-rule bg-white overflow-hidden">
          <div className="border-b border-sparrow-rule px-4 py-2.5 bg-sparrow-mist">
            <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray">
              Missing Items — Shopping Reference
            </p>
          </div>
          <ul className="divide-y divide-sparrow-rule">
            {missing.map((c) => (
              <li key={c.id} className="px-4 py-2.5 flex items-center gap-3">
                <span className="h-1.5 w-1.5 rounded-full bg-priority-p1 shrink-0" />
                <div>
                  <p className="text-sm text-sparrow-ink">{c.item?.description}</p>
                  {c.item?.sub_location && (
                    <p className="text-xs text-sparrow-gray">{c.item.sub_location.name}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Leave-behinds being kept */}
      {keptItems.length > 0 && (
        <div className="rounded-xl border border-sparrow-rule bg-white overflow-hidden">
          <div className="border-b border-sparrow-rule px-4 py-2.5 bg-sparrow-mist">
            <p className="text-xs font-semibold uppercase tracking-wide text-sparrow-gray">
              Leave-Behinds Being Kept
            </p>
          </div>
          <ul className="divide-y divide-sparrow-rule">
            {keptItems.map((lb) => (
              <li key={lb.id} className="px-4 py-2.5 flex items-center gap-3">
                <span className="h-1.5 w-1.5 rounded-full bg-sparrow-green shrink-0" />
                <p className="text-sm text-sparrow-ink">
                  {lb.description}
                  {lb.estimated_value ? ` · ~$${lb.estimated_value}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Approve section */}
      {canApprove ? (
        <div className="space-y-3">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Notes / shopping list (optional — jot anything you want to remember before purchasing)"
            className="w-full rounded-lg border border-sparrow-rule px-3 py-2 text-sm focus:outline-none focus:border-sparrow-green resize-none"
          />
          <button
            onClick={() => onApprove(notes)}
            disabled={saving}
            className="w-full rounded-lg bg-sparrow-green px-4 py-2.5 text-sm font-medium text-white hover:bg-sparrow-green/90 transition disabled:opacity-50"
          >
            {saving ? 'Approving…' : 'Approve — ready to purchase →'}
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-sparrow-rule bg-sparrow-mist p-5 text-center">
          <p className="text-sm font-medium text-sparrow-ink">Awaiting supervisor approval</p>
          <p className="text-sm text-sparrow-gray mt-1">
            A supervisor needs to review this screen and approve before purchasing can begin.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Purchasing ─────────────────────────────────────────────────────────────

function PurchasingScreen({
  onReadyToLog,
  saving,
}: {
  flip: InvHouseFlip;
  onReadyToLog: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-xl font-semibold text-sparrow-ink">Purchasing</h2>
        <p className="text-sm text-sparrow-gray mt-1">
          The supervisor has approved. Complete all purchases for the house, then come back here to log what came in.
        </p>
      </div>
      <div className="rounded-xl border border-sparrow-rule bg-sparrow-mist p-5 text-center">
        <p className="text-sm text-sparrow-gray">
          Nothing to do here yet — come back once purchasing is complete.
        </p>
      </div>
      <button
        onClick={onReadyToLog}
        disabled={saving}
        className="w-full rounded-lg bg-sparrow-green px-4 py-2.5 text-sm font-medium text-white hover:bg-sparrow-green/90 transition disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Purchasing complete — log new items →'}
      </button>
    </div>
  );
}

// ── New items ──────────────────────────────────────────────────────────────

function NewItemsScreen({
  flip,
  newItems,
  setNewItems,
  subLocs,
  onSubmit,
  saving,
}: {
  flip: InvHouseFlip;
  newItems: InvFlipNewItem[];
  setNewItems: React.Dispatch<React.SetStateAction<InvFlipNewItem[]>>;
  subLocs: InvSubLocation[];
  onSubmit: () => void;
  saving: boolean;
}) {
  const [showForm,   setShowForm]   = useState(false);
  const [isBatch,    setIsBatch]    = useState(false);
  const [nothingNew, setNothingNew] = useState(false);
  const [formErr,    setFormErr]    = useState('');
  const [formSaving, setFormSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const desc = (fd.get('description') as string).trim();
    if (!desc) { setFormErr('Description is required.'); return; }
    const cost = Number(fd.get('cost'));
    if (isNaN(cost) || cost < 0) { setFormErr('Enter a valid cost.'); return; }
    setFormSaving(true);
    setFormErr('');
    try {
      const entry = await addFlipNewItem(flip.id, {
        description:     desc,
        serial_number:   (fd.get('serial_number') as string).trim() || null,
        is_batch:        isBatch,
        batch_category:  isBatch ? (fd.get('batch_category') as string) : null,
        condition:       fd.get('condition') as string,
        is_donated:      fd.get('is_donated') === 'true',
        quantity:        Number(fd.get('quantity')) || 1,
        cost,
        cost_basis:      fd.get('cost_basis') as string,
        cost_source:     fd.get('cost_source') as string,
        sub_location_id: (fd.get('sub_location_id') as string) || null,
        notes:           (fd.get('notes') as string).trim() || null,
      });
      setNewItems((prev) => [...prev, entry]);
      setShowForm(false);
      setIsBatch(false);
      formRef.current?.reset();
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setFormSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteFlipNewItem(id);
      setNewItems((prev) => prev.filter((ni) => ni.id !== id));
    } catch {
      // silent
    }
  }

  const canSubmit = newItems.length > 0 || nothingNew;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-xl font-semibold text-sparrow-ink">Log New Items</h2>
        <p className="text-sm text-sparrow-gray mt-1">
          Log everything that was purchased or brought in for the new resident. Same rules as a monthly submission.
        </p>
      </div>

      {newItems.length > 0 && (
        <ul className="rounded-xl border border-sparrow-rule bg-white divide-y divide-sparrow-rule overflow-hidden">
          {newItems.map((ni) => (
            <li key={ni.id} className="flex items-start gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sparrow-ink">
                  {ni.description}
                  {ni.quantity > 1 && ` ×${ni.quantity}`}
                </p>
                <p className="text-xs text-sparrow-gray mt-0.5">
                  ${ni.cost}
                  {ni.cost_basis === 'total' ? ' total' : ' each'}
                  {ni.condition === 'new' ? ' · New' : ' · Used'}
                  {ni.is_donated && ' · Donated'}
                  {ni.sub_location ? ` · ${ni.sub_location.name}` : ''}
                </p>
              </div>
              <button
                onClick={() => handleDelete(ni.id)}
                className="text-xs text-sparrow-gray hover:text-priority-p1 transition shrink-0"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <form
          ref={formRef}
          onSubmit={handleAdd}
          className="rounded-xl border border-sparrow-rule bg-white p-4 space-y-3"
        >
          <p className="text-sm font-medium text-sparrow-ink">Add item</p>
          {formErr && <p className="text-xs text-priority-p1">{formErr}</p>}

          <div className="flex gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                checked={!isBatch}
                onChange={() => setIsBatch(false)}
                className="accent-sparrow-green"
              />
              Individual item
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                checked={isBatch}
                onChange={() => setIsBatch(true)}
                className="accent-sparrow-green"
              />
              Batch (all under $50)
            </label>
          </div>

          {isBatch ? (
            <select
              name="batch_category"
              className="w-full rounded-lg border border-sparrow-rule px-3 py-2 text-sm focus:outline-none focus:border-sparrow-green"
            >
              {BATCH_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          ) : (
            <input
              name="description"
              placeholder="Description (required)"
              className="w-full rounded-lg border border-sparrow-rule px-3 py-2 text-sm focus:outline-none focus:border-sparrow-green"
            />
          )}

          {isBatch && (
            <input
              name="description"
              placeholder="Description (e.g. 'assorted kitchen supplies')"
              className="w-full rounded-lg border border-sparrow-rule px-3 py-2 text-sm focus:outline-none focus:border-sparrow-green"
            />
          )}

          {!isBatch && (
            <input
              name="serial_number"
              placeholder="Serial number (electronics, tools, appliances)"
              className="w-full rounded-lg border border-sparrow-rule px-3 py-2 text-sm focus:outline-none focus:border-sparrow-green"
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <select
              name="condition"
              defaultValue="new"
              className="rounded-lg border border-sparrow-rule px-3 py-2 text-sm focus:outline-none focus:border-sparrow-green"
            >
              <option value="new">New</option>
              <option value="used">Used</option>
            </select>
            <select
              name="is_donated"
              defaultValue="false"
              className="rounded-lg border border-sparrow-rule px-3 py-2 text-sm focus:outline-none focus:border-sparrow-green"
            >
              <option value="false">Purchased</option>
              <option value="true">Donated</option>
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <input
              name="quantity"
              type="number"
              min="1"
              defaultValue="1"
              placeholder="Qty"
              className="rounded-lg border border-sparrow-rule px-3 py-2 text-sm focus:outline-none focus:border-sparrow-green"
            />
            <input
              name="cost"
              type="number"
              min="0"
              step="0.01"
              placeholder="Cost ($)"
              className="rounded-lg border border-sparrow-rule px-3 py-2 text-sm focus:outline-none focus:border-sparrow-green"
            />
            <select
              name="cost_basis"
              defaultValue="per_item"
              className="rounded-lg border border-sparrow-rule px-3 py-2 text-sm focus:outline-none focus:border-sparrow-green"
            >
              <option value="per_item">Per item</option>
              <option value="total">Total</option>
            </select>
          </div>

          <select
            name="cost_source"
            defaultValue="known"
            className="w-full rounded-lg border border-sparrow-rule px-3 py-2 text-sm focus:outline-none focus:border-sparrow-green"
          >
            <option value="known">Known (receipt or handoff)</option>
            <option value="estimated">Estimated (best guess)</option>
          </select>

          {subLocs.length > 0 && (
            <select
              name="sub_location_id"
              className="w-full rounded-lg border border-sparrow-rule px-3 py-2 text-sm focus:outline-none focus:border-sparrow-green"
            >
              <option value="">No specific room</option>
              {subLocs.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setShowForm(false); setIsBatch(false); }}
              className="flex-1 rounded-lg border border-sparrow-rule px-3 py-2 text-sm text-sparrow-gray hover:bg-sparrow-mist transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={formSaving}
              className="flex-1 rounded-lg bg-sparrow-green px-3 py-2 text-sm font-medium text-white hover:bg-sparrow-green/90 transition disabled:opacity-50"
            >
              {formSaving ? 'Saving…' : 'Add'}
            </button>
          </div>
        </form>
      )}

      {!showForm && (
        <button
          onClick={() => { setNothingNew(false); setShowForm(true); }}
          className="w-full rounded-lg border border-dashed border-sparrow-rule px-4 py-2.5 text-sm text-sparrow-gray hover:border-sparrow-green/50 hover:text-sparrow-green transition"
        >
          + Add item
        </button>
      )}

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={nothingNew}
          onChange={(e) => setNothingNew(e.target.checked)}
          className="accent-sparrow-green"
        />
        Nothing new came in
      </label>

      <button
        onClick={onSubmit}
        disabled={!canSubmit || saving}
        className="w-full rounded-lg bg-sparrow-green px-4 py-2.5 text-sm font-medium text-white hover:bg-sparrow-green/90 transition disabled:opacity-50"
      >
        {saving ? 'Submitting…' : 'Submit house flip →'}
      </button>
    </div>
  );
}

// ── Submitted ──────────────────────────────────────────────────────────────

function SubmittedScreen({
  locationName,
  onBack,
}: {
  locationName: string;
  onBack: () => void;
}) {
  return (
    <div className="rounded-xl border border-sparrow-rule bg-white p-8 text-center space-y-4">
      <div className="h-12 w-12 rounded-full bg-sparrow-green/10 flex items-center justify-center mx-auto">
        <svg className="h-6 w-6 text-sparrow-green" viewBox="0 0 24 24" fill="none">
          <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div>
        <h2 className="font-serif text-xl font-semibold text-sparrow-ink">House Flip Complete</h2>
        <p className="text-sm text-sparrow-gray mt-1">{locationName}</p>
      </div>
      <p className="text-sm text-sparrow-gray">
        The asset register has been updated. Missing items are marked removed; new items and kept leave-behinds have been added.
      </p>
      <button
        onClick={onBack}
        className="rounded-lg border border-sparrow-rule px-6 py-2 text-sm text-sparrow-gray hover:bg-sparrow-mist transition"
      >
        Done
      </button>
    </div>
  );
}
