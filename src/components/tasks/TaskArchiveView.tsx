import type { TaskWithPeople } from '@/lib/types';
import { dueLabel } from '@/lib/tasks';
import { PriorityChip } from '../PriorityChip';
import { DeptTag } from '../DeptTag';

interface Props {
  tasks: TaskWithPeople[];
  today: string;
  showAssignee: boolean;
  onOpen: (task: TaskWithPeople) => void;
  onToggle: (task: TaskWithPeople) => void;
}

export function TaskArchiveView({ tasks, today, showAssignee, onOpen, onToggle }: Props) {
  if (tasks.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-sparrow-rule bg-white p-8 text-center text-sm text-sparrow-gray">
        No completed tasks yet.
      </p>
    );
  }

  return (
    <div>
      <p className="mb-3 text-xs text-sparrow-gray">
        {tasks.length} completed task{tasks.length !== 1 ? 's' : ''}. Uncheck any to move it back to active.
      </p>
      <ul className="divide-y divide-sparrow-rule overflow-hidden rounded-xl border border-sparrow-rule bg-white">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-3 px-4 py-3 opacity-60 hover:opacity-100 hover:bg-sparrow-mist transition-opacity">
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
  );
}
