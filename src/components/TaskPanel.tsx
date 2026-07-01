import { useEffect, useState, useTransition } from 'react';
import {
  DEPARTMENTS,
  PRIORITIES,
  type Department,
  type Priority,
  type Profile,
  type TaskComment,
  type TaskStatus,
  type TaskWithPeople,
} from '@/lib/types';
import { addComment, createTask, deleteTask, notifyTaskCommentMentions, updateTask, type TaskInput } from '@/lib/data';
import { parseMentionIds } from '@/lib/chat';
import { MentionInput } from '@/components/chat/MentionInput';

interface Props {
  open: boolean;
  task: TaskWithPeople | null;
  profiles: Profile[];
  currentUser: Profile;
  comments: TaskComment[];
  today: string;
  onClose: () => void;
  onChanged: () => void;
}

export function TaskPanel({ open, task, profiles, currentUser, comments, today, onClose, onChanged }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [department, setDepartment] = useState<Department>('ops');
  const [priority, setPriority] = useState<Priority>('p3');
  const [assigneeId, setAssigneeId] = useState(currentUser.id);
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [comment, setComment] = useState('');

  // Reset the form whenever the panel opens for a new/different task.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setComment('');
    if (task) {
      setTitle(task.title);
      setNotes(task.notes ?? '');
      setDueDate(task.due_date ?? '');
      setDepartment(task.department);
      setPriority(task.priority);
      setAssigneeId(task.assignee_id);
      setStatus(task.status);
    } else {
      setTitle('');
      setNotes('');
      setDueDate('');
      setDepartment(currentUser.department);
      setPriority('p3');
      setAssigneeId(currentUser.id);
      setStatus('todo');
    }
  }, [open, task, currentUser]);

  const tomorrow = (() => {
    const d = new Date(today + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  })();

  function save() {
    if (!title.trim()) {
      setError('A title is required.');
      return;
    }
    const input: TaskInput = {
      title: title.trim(),
      notes: notes.trim() || null,
      due_date: dueDate || null,
      department,
      priority,
      assignee_id: assigneeId,
      status,
    };
    startTransition(async () => {
      try {
        if (task) await updateTask(task.id, input);
        else await createTask(input, currentUser.id);
        onChanged();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save.');
      }
    });
  }

  function remove() {
    if (!task) return;
    startTransition(async () => {
      try {
        await deleteTask(task.id);
        onChanged();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not delete.');
      }
    });
  }

  function postComment() {
    if (!task || !comment.trim()) return;
    const body = comment.trim();
    startTransition(async () => {
      try {
        await addComment(task.id, body, currentUser.id);
        const mentioned = parseMentionIds(body, profiles);
        if (mentioned.length > 0) {
          void notifyTaskCommentMentions(mentioned, currentUser.id, task.id, body).catch(() => {});
        }
        setComment('');
        onChanged();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not comment.');
      }
    });
  }

  const nameById = (id: string) => profiles.find((p) => p.id === id)?.full_name ?? 'Someone';

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-sparrow-ink/30 transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-xl transition-transform ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-sparrow-rule px-5 py-4">
          <h2 className="font-serif text-lg font-semibold">{task ? 'Edit task' : 'New task'}</h2>
          <button onClick={onClose} className="btn-ghost" aria-label="Close">
            ✕
          </button>
        </div>

        {error && (
          <div className="border-b border-red-200 bg-red-50 px-5 py-3">
            <p className="text-sm font-medium text-red-700">{error}</p>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <label className="field-label" htmlFor="t-title">
            Task
          </label>
          <input
            id="t-title"
            className="field-input text-base"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs doing?"
            autoFocus
          />

          <div className="mt-4">
            <label className="field-label" htmlFor="t-notes">
              Notes
            </label>
            <textarea
              id="t-notes"
              className="field-input"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="mt-4">
            <label className="field-label">Due date</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="date"
                className="field-input !mt-0 flex-1"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
              <button type="button" className="btn-ghost" onClick={() => setDueDate(today)}>
                Today
              </button>
              <button type="button" className="btn-ghost" onClick={() => setDueDate(tomorrow)}>
                Tomorrow
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="t-dept">
                Department
              </label>
              <select
                id="t-dept"
                className="field-input"
                value={department}
                onChange={(e) => setDepartment(e.target.value as Department)}
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="t-priority">
                Priority
              </label>
              <select
                id="t-priority"
                className="field-input"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="t-assignee">
                Assignee
              </label>
              <select
                id="t-assignee"
                className="field-input"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id === currentUser.id ? 'Me' : p.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="t-status">
                Status
              </label>
              <select
                id="t-status"
                className="field-input"
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
              >
                <option value="todo">To do</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </select>
            </div>
          </div>

          {task && (
            <div className="mt-6 border-t border-sparrow-rule pt-4">
              <p className="field-label">Comments</p>
              <ul className="mt-2 space-y-3">
                {comments.length === 0 && <li className="text-sm text-sparrow-gray">No comments yet.</li>}
                {comments.map((c) => (
                  <li key={c.id} className="text-sm">
                    <span className="font-medium text-sparrow-ink">{nameById(c.author_id)}</span>
                    <span className="ml-2 text-xs text-sparrow-gray">
                      {new Date(c.created_at).toLocaleDateString()}
                    </span>
                    <p className="text-sparrow-ink">{c.body}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-end gap-2">
                <MentionInput
                  value={comment}
                  onChange={setComment}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) postComment(); }}
                  staff={profiles}
                  disabled={pending}
                  placeholder="Add a comment… (@ to mention)"
                  className="field-input mt-0 max-h-24 w-full resize-none"
                />
                <button onClick={postComment} disabled={pending || !comment.trim()} className="btn-ghost">
                  Post
                </button>
              </div>
            </div>
          )}

        </div>

        <div className="flex items-center justify-between border-t border-sparrow-rule px-5 py-4">
          {task ? (
            <button onClick={remove} disabled={pending} className="btn-ghost text-priority-p1">
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost">
              Cancel
            </button>
            <button onClick={save} disabled={pending} className="btn-primary">
              {pending ? 'Saving…' : task ? 'Save' : 'Create task'}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
