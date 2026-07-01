import { useEffect, useRef, useState } from 'react';
import { Drawer } from '@/components/lcp/Drawer';
import { createGroup, fetchStaff, initials, startDirect, type ChatPerson } from '@/lib/chat';

/**
 * Pick one staff member to open a direct message, or several to start a named group.
 * Resolves to the channel id of the new/existing conversation.
 */
export function NewConversationPanel({
  open,
  meId,
  onClose,
  onCreated,
}: {
  open: boolean;
  meId: string;
  onClose: () => void;
  onCreated: (channelId: string) => void;
}) {
  const [people, setPeople] = useState<ChatPerson[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setGroupName('');
    setError(null);
    fetchStaff(meId)
      .then(setPeople)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load staff'));
  }, [open, meId]);

  const ids = [...selected];
  const isGroup = ids.length > 1;
  const canCreate = ids.length > 0 && (!isGroup || groupName.trim().length > 0);
  const needsName = isGroup && groupName.trim().length === 0;

  // Auto-focus the group name field the moment it appears.
  useEffect(() => {
    if (isGroup) nameRef.current?.focus();
  }, [isGroup]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function create() {
    if (!canCreate || busy) return;
    setBusy(true);
    setError(null);
    try {
      const channelId = isGroup ? await createGroup(groupName, ids) : await startDirect(ids[0]);
      onCreated(channelId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the conversation');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="New message"
      subtitle={isGroup ? 'Group — pick people and name it' : 'Pick someone to message'}
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-sparrow-gray">
            {ids.length === 0 ? 'No one selected' : isGroup ? `${ids.length} people` : '1 person'}
          </span>
          <button onClick={() => void create()} disabled={!canCreate || busy} className="btn-primary">
            {needsName ? 'Add a group name above' : isGroup ? 'Create group' : 'Start chat'}
          </button>
        </div>
      }
    >
      {error && (
        <p className="mb-3 rounded-lg bg-priority-p1/10 px-3 py-2 text-sm text-priority-p1">{error}</p>
      )}

      {isGroup && (
        <div className="mb-4">
          <label className="field-label" htmlFor="group-name">
            Group name
          </label>
          <input
            ref={nameRef}
            id="group-name"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="e.g. Twin Oaks crew"
            className="field-input"
          />
        </div>
      )}

      <ul className="space-y-1">
        {people.map((p) => {
          const on = selected.has(p.id);
          return (
            <li key={p.id}>
              <button
                onClick={() => toggle(p.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition ${
                  on ? 'bg-sparrow-sage' : 'hover:bg-sparrow-mist'
                }`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sparrow-green text-xs font-semibold text-white">
                  {initials(p.full_name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-sparrow-ink">{p.full_name}</span>
                  <span className="block truncate text-xs capitalize text-sparrow-gray">{p.department}</span>
                </span>
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] ${
                    on ? 'border-sparrow-green bg-sparrow-green text-white' : 'border-sparrow-rule text-transparent'
                  }`}
                  aria-hidden
                >
                  ✓
                </span>
              </button>
            </li>
          );
        })}
        {people.length === 0 && !error && (
          <li className="px-2 py-6 text-center text-sm text-sparrow-gray">Loading staff…</li>
        )}
      </ul>
    </Drawer>
  );
}
