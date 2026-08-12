import { useState } from 'react';
import type { TaskWithPeople } from '@/lib/types';
import { dueLabel } from '@/lib/tasks';
import { PriorityChip } from '../PriorityChip';
import { DeptTag } from '../DeptTag';
import { LabelPill } from '../LabelPill';

const STATUS_LABEL: Record<string, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
};

interface Props {
  tasks: TaskWithPeople[];
  delegatedTasks: TaskWithPeople[];
  today: string;
  showAssignee: boolean;
  onOpen: (task: TaskWithPeople) => void;
  onToggle: (task: TaskWithPeople) => void;
  onClearAll: (taskIds: string[]) => void;
}

export function TaskArchiveView({ tasks, delegatedTasks, today, showAssignee, onOpen, onToggle, onClearAll }: Props) {
  const [tab, setTab] = useState<'done' | 'assigned'>('done');
  const [confirmingClear, setConfirmingClear] = useState(false);

  const delegatedDone = delegatedTasks.filter((t) => t.status === 'done');

  function switchTab(next: 'done' | 'assigned') {
    setTab(next);
    setConfirmingClear(false);
  }

  function clearAll() {
    const ids = tab === 'done' ? tasks.map((t) => t.id) : delegatedDone.map((t) => t.id);
    onClearAll(ids);
    setConfirmingClear(false);
  }

  const clearCount = tab === 'done' ? tasks.length : delegatedDone.length;

  return (
    <div>
      {/* Tab switcher */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-1 text-sm">
          <button
            onClick={() => switchTab('done')}
            className={`rounded-lg px-3 py-1.5 font-medium transition ${
              tab === 'done' ? 'bg-sparrow-green text-white' : 'text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink'
            }`}
          >
            Done {tasks.length > 0 && <span className="ml-1 opacity-70">· {tasks.length}</span>}
          </button>
          <button
            onClick={() => switchTab('assigned')}
            className={`rounded-lg px-3 py-1.5 font-medium transition ${
              tab === 'assigned' ? 'bg-sparrow-green text-white' : 'text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink'
            }`}
          >
            Assigned out {delegatedTasks.length > 0 && <span className="ml-1 opacity-70">· {delegatedTasks.length}</span>}
          </button>
        </div>
        {clearCount > 0 && (
          confirmingClear ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-sparrow-gray dark:text-sparrow-dark-gray">Permanently delete {clearCount}?</span>
              <button onClick={clearAll} className="btn-primary px-2 py-1 text-xs">Yes, clear</button>
              <button onClick={() => setConfirmingClear(false)} className="btn-ghost px-2 py-1 text-xs">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirmingClear(true)} className="btn-ghost border border-sparrow-rule dark:border-sparrow-dark-border text-xs">
              Clear all {tab === 'done' ? 'done' : 'completed'}
            </button>
          )
        )}
      </div>

      {tab === 'done' && (
        tasks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-8 text-center text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
            No completed tasks yet.
          </p>
        ) : (
          <div>
            <p className="mb-3 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
              {tasks.length} completed task{tasks.length !== 1 ? 's' : ''}. Uncheck any to move it back to active.
            </p>
            <ul className="divide-y divide-sparrow-rule dark:divide-sparrow-dark-border overflow-hidden rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3 opacity-60 transition-opacity hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2 hover:opacity-100">
                  <input
                    type="checkbox"
                    checked={true}
                    onChange={() => onToggle(t)}
                    aria-label="Mark not done"
                    className="h-4 w-4 shrink-0 cursor-pointer accent-sparrow-green"
                  />
                  <button onClick={() => onOpen(t)} className="flex flex-1 items-center gap-3 text-left">
                    <span className="flex-1">
                      <span className="text-sm line-through text-sparrow-gray dark:text-sparrow-dark-gray">{t.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        {t.due_date && (
                          <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{dueLabel(t.due_date, today)}</span>
                        )}
                        {showAssignee && t.assignee && (
                          <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{t.assignee.full_name}</span>
                        )}
                      </span>
                    </span>
                    <DeptTag d={t.department} />
                    <PriorityChip p={t.priority} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      )}

      {tab === 'assigned' && (
        delegatedTasks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-8 text-center text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
            No tasks assigned out.
          </p>
        ) : (
          <div>
            <p className="mb-3 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
              {delegatedTasks.length} task{delegatedTasks.length !== 1 ? 's' : ''} you've assigned out. Click to view or comment.
            </p>
            <ul className="divide-y divide-sparrow-rule dark:divide-sparrow-dark-border overflow-hidden rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface">
              {delegatedTasks.map((t) => (
                <li key={t.id} className={`flex items-center gap-3 px-4 py-3 transition-opacity hover:bg-sparrow-mist dark:hover:bg-sparrow-dark-surface2 ${t.status === 'done' ? 'opacity-60 hover:opacity-100' : ''}`}>
                  <button onClick={() => onOpen(t)} className="flex flex-1 items-center gap-3 text-left">
                    <span className="flex-1">
                      <span className={`text-sm ${t.status === 'done' ? 'line-through text-sparrow-gray dark:text-sparrow-dark-gray' : 'text-sparrow-ink dark:text-sparrow-dark-ink'}`}>{t.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        {t.label && t.label_color && (
                          <LabelPill label={t.label} color={t.label_color} />
                        )}
                        {t.assignee && (
                          <span className="text-xs font-medium text-blue-600">→ {t.assignee.full_name}</span>
                        )}
                        <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{STATUS_LABEL[t.status] ?? t.status}</span>
                        {t.due_date && (
                          <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{dueLabel(t.due_date, today)}</span>
                        )}
                      </span>
                    </span>
                    <DeptTag d={t.department} />
                    <PriorityChip p={t.priority} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      )}
    </div>
  );
}
