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
}

export function TaskArchiveView({ tasks, delegatedTasks, today, showAssignee, onOpen, onToggle }: Props) {
  const [tab, setTab] = useState<'done' | 'assigned'>('done');

  return (
    <div>
      {/* Tab switcher */}
      <div className="mb-4 inline-flex rounded-xl border border-sparrow-rule bg-white p-1 text-sm">
        <button
          onClick={() => setTab('done')}
          className={`rounded-lg px-3 py-1.5 font-medium transition ${
            tab === 'done' ? 'bg-sparrow-green text-white' : 'text-sparrow-gray hover:text-sparrow-ink'
          }`}
        >
          Done {tasks.length > 0 && <span className="ml-1 opacity-70">· {tasks.length}</span>}
        </button>
        <button
          onClick={() => setTab('assigned')}
          className={`rounded-lg px-3 py-1.5 font-medium transition ${
            tab === 'assigned' ? 'bg-sparrow-green text-white' : 'text-sparrow-gray hover:text-sparrow-ink'
          }`}
        >
          Assigned out {delegatedTasks.length > 0 && <span className="ml-1 opacity-70">· {delegatedTasks.length}</span>}
        </button>
      </div>

      {tab === 'done' && (
        tasks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-sparrow-rule bg-white p-8 text-center text-sm text-sparrow-gray">
            No completed tasks yet.
          </p>
        ) : (
          <div>
            <p className="mb-3 text-xs text-sparrow-gray">
              {tasks.length} completed task{tasks.length !== 1 ? 's' : ''}. Uncheck any to move it back to active.
            </p>
            <ul className="divide-y divide-sparrow-rule overflow-hidden rounded-xl border border-sparrow-rule bg-white">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3 opacity-60 transition-opacity hover:bg-sparrow-mist hover:opacity-100">
                  <input
                    type="checkbox"
                    checked={true}
                    onChange={() => onToggle(t)}
                    aria-label="Mark not done"
                    className="h-4 w-4 shrink-0 cursor-pointer accent-sparrow-green"
                  />
                  <button onClick={() => onOpen(t)} className="flex flex-1 items-center gap-3 text-left">
                    <span className="flex-1">
                      <span className="text-sm line-through text-sparrow-gray">{t.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        {t.due_date && (
                          <span className="text-xs text-sparrow-gray">{dueLabel(t.due_date, today)}</span>
                        )}
                        {showAssignee && t.assignee && (
                          <span className="text-xs text-sparrow-gray">{t.assignee.full_name}</span>
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
          <p className="rounded-xl border border-dashed border-sparrow-rule bg-white p-8 text-center text-sm text-sparrow-gray">
            No tasks assigned out.
          </p>
        ) : (
          <div>
            <p className="mb-3 text-xs text-sparrow-gray">
              {delegatedTasks.length} task{delegatedTasks.length !== 1 ? 's' : ''} you've assigned out. Click to view or comment.
            </p>
            <ul className="divide-y divide-sparrow-rule overflow-hidden rounded-xl border border-sparrow-rule bg-white">
              {delegatedTasks.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3 hover:bg-sparrow-mist">
                  <button onClick={() => onOpen(t)} className="flex flex-1 items-center gap-3 text-left">
                    <span className="flex-1">
                      <span className="text-sm text-sparrow-ink">{t.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        {t.label && t.label_color && (
                          <LabelPill label={t.label} color={t.label_color} />
                        )}
                        {t.assignee && (
                          <span className="text-xs font-medium text-blue-600">→ {t.assignee.full_name}</span>
                        )}
                        <span className="text-xs text-sparrow-gray">{STATUS_LABEL[t.status] ?? t.status}</span>
                        {t.due_date && (
                          <span className="text-xs text-sparrow-gray">{dueLabel(t.due_date, today)}</span>
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
