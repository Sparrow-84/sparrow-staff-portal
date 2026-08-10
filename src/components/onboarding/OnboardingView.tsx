import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import {
  completeChecklist,
  fetchChecklistSteps,
  fetchMyOnboardingChecklist,
  setStepDone,
} from '@/lib/ops';
import type { Checklist, ChecklistStep } from '@/lib/ops-types';

export function OnboardingView({ onDone }: { onDone: () => void }) {
  const { profile } = useAuth();
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [steps, setSteps] = useState<ChecklistStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    const cl = await fetchMyOnboardingChecklist();
    setChecklist(cl);
    if (cl) {
      setSteps(await fetchChecklistSteps(cl.id));
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Build two-level structure
  const topLevel = useMemo(
    () => steps.filter((s) => !s.parent_step_id).sort((a, b) => a.step_no - b.step_no),
    [steps],
  );
  const subtaskMap = useMemo(() => {
    const m = new Map<string, ChecklistStep[]>();
    for (const s of steps.filter((s) => s.parent_step_id)) {
      const pid = s.parent_step_id!;
      if (!m.has(pid)) m.set(pid, []);
      m.get(pid)!.push(s);
    }
    // Sort each group
    for (const [k, v] of m) m.set(k, v.sort((a, b) => a.step_no - b.step_no));
    return m;
  }, [steps]);

  // Progress counts leaf steps only
  // A leaf is: a subtask, OR a top-level item with no subtasks
  const leafSteps = useMemo(
    () => steps.filter((s) => s.parent_step_id !== null || !subtaskMap.has(s.id)),
    [steps, subtaskMap],
  );
  const doneCount = leafSteps.filter((s) => s.done).length;
  const totalCount = leafSteps.length;
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const allDone = totalCount > 0 && doneCount === totalCount;

  async function toggle(step: ChecklistStep) {
    if (!profile) return;
    setToggling(step.id);
    const next = !step.done;
    setSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, done: next } : s)));
    try {
      await setStepDone(step.id, next, profile.id);
    } catch {
      // Revert on error
      setSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, done: step.done } : s)));
    } finally {
      setToggling(null);
    }
  }

  async function finish() {
    if (!checklist) return;
    setCompleting(true);
    await completeChecklist(checklist.id);
    setCompleting(false);
    onDone();
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Loading your checklist…</p>
      </div>
    );
  }

  if (!checklist) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-base font-medium text-sparrow-ink dark:text-sparrow-dark-ink">No onboarding checklist yet</p>
        <p className="max-w-sm text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
          Your manager will set this up for you. Check back soon, or reach out if you think this is a mistake.
        </p>
        <button onClick={onDone} className="btn-ghost">
          Go to dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-8">
        <p className="mb-1 font-serif text-2xl font-semibold text-sparrow-green dark:text-sparrow-dark-green">
          Welcome, {profile?.full_name?.split(' ')[0]}!
        </p>
        <p className="mb-6 text-sparrow-gray dark:text-sparrow-dark-gray">
          Here's everything to get you started. Work through it in order — you can always come back later.
        </p>

        {/* Progress bar */}
        <div className="flex items-center gap-3">
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-sparrow-sage dark:bg-sparrow-dark-border">
            <div
              className="h-full rounded-full bg-sparrow-green transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="shrink-0 text-sm font-medium text-sparrow-ink dark:text-sparrow-dark-ink">
            {doneCount} of {totalCount}
          </span>
        </div>
        {allDone && (
          <p className="mt-2 text-sm font-medium text-sparrow-green dark:text-sparrow-dark-green">
            You're all done — nice work!
          </p>
        )}
      </div>

      {/* Items */}
      <ol className="space-y-3">
        {topLevel.map((item, idx) => {
          const subs = subtaskMap.get(item.id) ?? [];
          const hasSubs = subs.length > 0;
          // Parent is visually complete when all its subtasks are done (or done itself if no subs)
          const parentDone = hasSubs ? subs.every((s) => s.done) : item.done;

          return (
            <li key={item.id} className={`rounded-xl border transition-colors ${parentDone ? 'border-sparrow-green/30 bg-sparrow-sage/30' : 'border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface'}`}>
              {/* Top-level item header */}
              <div className="flex items-start gap-3 p-4">
                {hasSubs ? (
                  // Section header — not directly checkable; completion derived from subtasks
                  <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors ${parentDone ? 'bg-sparrow-green text-white' : 'bg-sparrow-sage text-sparrow-green dark:text-sparrow-dark-green'}`}>
                    {parentDone ? '✓' : idx + 1}
                  </div>
                ) : (
                  // Leaf item — directly checkable
                  <button
                    onClick={() => toggle(item)}
                    disabled={toggling === item.id}
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition-all ${item.done ? 'border-sparrow-green dark:border-sparrow-dark-green bg-sparrow-green text-white' : 'border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface text-transparent hover:border-sparrow-green/60'}`}
                    aria-label={item.done ? 'Mark not done' : 'Mark done'}
                  >
                    ✓
                  </button>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`font-medium ${parentDone ? 'text-sparrow-gray dark:text-sparrow-dark-gray line-through' : 'text-sparrow-ink dark:text-sparrow-dark-ink'}`}>
                      {item.title}
                    </span>
                    {item.estimated_minutes && (
                      <span className="rounded-full bg-sparrow-rule/60 px-2 py-0.5 text-[11px] text-sparrow-gray dark:text-sparrow-dark-gray">
                        ~{item.estimated_minutes} min
                      </span>
                    )}
                    {hasSubs && (
                      <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                        {subs.filter((s) => s.done).length}/{subs.length} subtasks
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <p className="mt-0.5 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">{item.description}</p>
                  )}
                  {!hasSubs && item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-sparrow-green dark:text-sparrow-dark-green hover:underline"
                    >
                      Open ↗
                    </a>
                  )}
                </div>

                {!hasSubs && !item.done && (
                  <button
                    onClick={() => toggle(item)}
                    disabled={toggling === item.id}
                    className="shrink-0 rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border px-3 py-1.5 text-sm font-medium text-sparrow-gray dark:text-sparrow-dark-gray transition hover:border-sparrow-green dark:hover:border-sparrow-dark-green hover:bg-sparrow-sage hover:text-sparrow-green dark:hover:text-sparrow-dark-green"
                  >
                    Mark done
                  </button>
                )}
              </div>

              {/* Subtasks */}
              {hasSubs && (
                <ul className="border-t border-sparrow-rule/60 px-4 pb-3 pt-2 space-y-2">
                  {subs.map((sub) => (
                    <li
                      key={sub.id}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${sub.done ? 'bg-sparrow-sage/50' : 'bg-sparrow-mist dark:bg-sparrow-dark-surface2'}`}
                    >
                      <button
                        onClick={() => toggle(sub)}
                        disabled={toggling === sub.id}
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-all ${sub.done ? 'border-sparrow-green dark:border-sparrow-dark-green bg-sparrow-green text-white' : 'border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface text-transparent hover:border-sparrow-green/60'}`}
                        aria-label={sub.done ? 'Mark not done' : 'Mark done'}
                      >
                        ✓
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-sm font-medium ${sub.done ? 'text-sparrow-gray dark:text-sparrow-dark-gray line-through' : 'text-sparrow-ink dark:text-sparrow-dark-ink'}`}>
                            {sub.title}
                          </span>
                          {sub.estimated_minutes && (
                            <span className="rounded-full bg-sparrow-rule/60 px-2 py-0.5 text-[11px] text-sparrow-gray dark:text-sparrow-dark-gray">
                              ~{sub.estimated_minutes} min
                            </span>
                          )}
                        </div>
                        {sub.description && (
                          <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{sub.description}</p>
                        )}
                        {sub.url && (
                          <a
                            href={sub.url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green hover:underline"
                          >
                            Open ↗
                          </a>
                        )}
                      </div>

                      {!sub.done && (
                        <button
                          onClick={() => toggle(sub)}
                          disabled={toggling === sub.id}
                          className="shrink-0 rounded-lg border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface px-3 py-1 text-xs font-medium text-sparrow-gray dark:text-sparrow-dark-gray transition hover:border-sparrow-green dark:hover:border-sparrow-dark-green hover:bg-sparrow-sage hover:text-sparrow-green dark:hover:text-sparrow-dark-green"
                        >
                          Done
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>

      {/* Footer actions */}
      <div className="mt-8 flex flex-col items-center gap-4">
        {allDone ? (
          <button
            onClick={finish}
            disabled={completing}
            className="btn-primary px-8 py-3 text-base"
          >
            {completing ? 'Finishing up…' : 'Complete onboarding ✓'}
          </button>
        ) : (
          <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
            {totalCount - doneCount} item{totalCount - doneCount !== 1 ? 's' : ''} left
          </p>
        )}
        <button onClick={onDone} className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink hover:underline">
          Go to dashboard
        </button>
      </div>
    </div>
  );
}
