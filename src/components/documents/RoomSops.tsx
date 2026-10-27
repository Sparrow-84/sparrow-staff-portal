import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import {
  addOrgDocument,
  deleteOrgDocument,
  fetchLinkableDocs,
  fetchRoomSops,
  linkDocToRoom,
  unlinkDocFromRoom,
  updateOrgDocument,
} from '@/lib/documents';
import {
  SOP_KINDS,
  sopRoomLabel,
  type OrgDocument,
  type RoomSop,
  type SopRoom,
} from '@/lib/documents-types';
import { useRequiredFields } from '@/hooks/useRequiredFields';

const SHARING_REMINDER =
  'Make sure everyone who uses this room can open the Google Drive file — a link here doesn’t give anyone access to it.';

/**
 * "SOPs" button for a room header + the slide-over list it opens.
 * Shows the room's own SOPs plus any linked in from the Resource Library or
 * other rooms. Room admins (SOPs) and admins can add, edit, remove, link, unlink.
 */
export function RoomSopsButton({ room }: { room: SopRoom }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Standard operating procedures for this room"
        className="btn-secondary shrink-0"
      >
        SOPs
      </button>
      <RoomSopsPanel room={room} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

type FormState = { title: string; kind: string; description: string; url: string };
const EMPTY_FORM: FormState = { title: '', kind: '', description: '', url: '' };

function RoomSopsPanel({ room, open, onClose }: { room: SopRoom; open: boolean; onClose: () => void }) {
  const { profile } = useAuth();
  const canEdit = profile?.role === 'admin' || (profile?.sop_admin_rooms ?? []).includes(room);
  const roomLabel = sopRoomLabel(room);

  const [sops, setSops] = useState<RoomSop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // null = closed; 'new' = adding; otherwise the id being edited
  const [formFor, setFormFor] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSops(await fetchRoomSops(room));
      setError(null);
    } catch {
      setError('SOPs aren’t available yet — the database update for this feature hasn’t been run.');
    } finally {
      setLoading(false);
    }
  }, [room]);

  useEffect(() => {
    if (!open) return;
    setFormFor(null);
    setLinking(false);
    setActionError(null);
    void load();
  }, [open, load]);

  const grouped = useMemo(() => {
    const map = new Map<string, RoomSop[]>();
    for (const kind of SOP_KINDS) map.set(kind, []);
    for (const s of sops) {
      if (!map.has(s.category)) map.set(s.category, []);
      map.get(s.category)!.push(s);
    }
    return [...map.entries()].filter(([, items]) => items.length > 0);
  }, [sops]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  function remove(sop: RoomSop) {
    const where = sop.linkedRooms.length > 0
      ? `\n\nThis is also shown in ${sop.linkedRooms.map(sopRoomLabel).join(', ')}. Removing it here removes it there too.`
      : '';
    if (!window.confirm(`Remove "${sop.title}" from the portal?${where}\n\n(The Google Drive file itself isn't touched.)`)) return;
    void run(() => deleteOrgDocument(sop.id));
  }

  function unlink(sop: RoomSop) {
    if (!window.confirm(`Stop showing "${sop.title}" in ${roomLabel}? It stays in ${sopRoomLabel(sop.home_room)}.`)) return;
    void run(() => unlinkDocFromRoom(sop.id, room));
  }

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
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white dark:bg-sparrow-dark-surface shadow-xl transition-transform ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-sparrow-rule dark:border-sparrow-dark-border px-5 py-4">
          <h2 className="font-serif text-lg font-semibold">{roomLabel} SOPs</h2>
          <button onClick={onClose} className="btn-ghost" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
            How this room’s work gets done. Each one opens in Google Drive.
          </p>

          {canEdit && !error && (
            <div className="mt-4 rounded-xl border border-dashed border-sparrow-rule dark:border-sparrow-dark-border p-3">
              {formFor === 'new' ? (
                <SopForm
                  initial={EMPTY_FORM}
                  saveLabel="Add SOP"
                  busy={busy}
                  onCancel={() => setFormFor(null)}
                  onSave={(f) =>
                    void run(async () => {
                      await addOrgDocument({
                        title: f.title.trim(),
                        category: f.kind,
                        description: f.description.trim() || null,
                        url: f.url.trim(),
                        sort_order: 0,
                        home_room: room,
                      });
                      setFormFor(null);
                    })
                  }
                />
              ) : linking ? (
                <LinkPicker
                  room={room}
                  alreadyShown={sops.map((s) => s.id)}
                  busy={busy}
                  onCancel={() => setLinking(false)}
                  onLink={(docId) =>
                    void run(async () => {
                      await linkDocToRoom(docId, room);
                      setLinking(false);
                    })
                  }
                />
              ) : (
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <button
                    onClick={() => setFormFor('new')}
                    className="text-sm text-sparrow-green dark:text-sparrow-dark-green hover:underline"
                  >
                    + Add SOP
                  </button>
                  <button
                    onClick={() => setLinking(true)}
                    className="text-sm text-sparrow-green dark:text-sparrow-dark-green hover:underline"
                  >
                    Link an existing doc
                  </button>
                </div>
              )}
            </div>
          )}

          {actionError && <p className="mt-3 text-sm text-priority-p1">{actionError}</p>}

          {loading ? (
            <p className="mt-6 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Loading…</p>
          ) : error ? (
            <p className="mt-6 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">{error}</p>
          ) : sops.length === 0 ? (
            <p className="mt-6 rounded-xl border border-dashed border-sparrow-rule dark:border-sparrow-dark-border px-4 py-6 text-center text-sm text-sparrow-gray dark:text-sparrow-dark-gray">
              No SOPs for {roomLabel} yet.
            </p>
          ) : (
            <div className="mt-6 space-y-6">
              {grouped.map(([kind, items]) => (
                <section key={kind}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sparrow-gray dark:text-sparrow-dark-gray">
                    {kind}
                  </h3>
                  <ul className="space-y-2">
                    {items.map((sop) => (
                      <li
                        key={sop.id}
                        className="rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border bg-white dark:bg-sparrow-dark-surface p-3"
                      >
                        {formFor === sop.id ? (
                          <SopForm
                            initial={{ title: sop.title, kind: sop.category, description: sop.description ?? '', url: sop.url ?? '' }}
                            saveLabel="Save"
                            busy={busy}
                            onCancel={() => setFormFor(null)}
                            onSave={(f) =>
                              void run(async () => {
                                await updateOrgDocument(sop.id, {
                                  title: f.title.trim(),
                                  category: f.kind,
                                  description: f.description.trim() || null,
                                  url: f.url.trim(),
                                });
                                setFormFor(null);
                              })
                            }
                          />
                        ) : (
                          <SopRow
                            sop={sop}
                            canEdit={canEdit}
                            busy={busy}
                            onEdit={() => { setFormFor(sop.id); setLinking(false); }}
                            onRemove={() => remove(sop)}
                            onUnlink={() => unlink(sop)}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function SopRow({
  sop,
  canEdit,
  busy,
  onEdit,
  onRemove,
  onUnlink,
}: {
  sop: RoomSop;
  canEdit: boolean;
  busy: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onUnlink: () => void;
}) {
  const action = 'rounded px-2 py-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray';
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sparrow-ink dark:text-sparrow-dark-ink">{sop.title}</p>
        {!sop.isOwn && (
          <span className="mt-1 inline-block rounded-full bg-sparrow-mist dark:bg-sparrow-dark-surface2 px-2 py-0.5 text-[11px] text-sparrow-gray dark:text-sparrow-dark-gray">
            from {sopRoomLabel(sop.home_room)}
          </span>
        )}
        {sop.description && (
          <p className="mt-0.5 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">{sop.description}</p>
        )}
        {canEdit && (
          <div className="mt-1 -ml-2 flex gap-1">
            {sop.isOwn ? (
              <>
                <button onClick={onEdit} disabled={busy} className={`${action} hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink`}>
                  Edit
                </button>
                <button onClick={onRemove} disabled={busy} className={`${action} hover:text-priority-p1`}>
                  Remove
                </button>
              </>
            ) : (
              <button onClick={onUnlink} disabled={busy} className={`${action} hover:text-sparrow-ink dark:hover:text-sparrow-dark-ink`}>
                Stop showing here
              </button>
            )}
          </div>
        )}
      </div>
      {sop.url ? (
        <a
          href={sop.url}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-lg border border-sparrow-green dark:border-sparrow-dark-green px-3 py-1.5 text-sm font-medium text-sparrow-green dark:text-sparrow-dark-green transition hover:bg-sparrow-sage dark:hover:bg-sparrow-green/15"
        >
          Open ↗
        </a>
      ) : (
        <span className="shrink-0 rounded-full bg-sparrow-rule/60 px-2.5 py-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
          Coming soon
        </span>
      )}
    </div>
  );
}

function SopForm({
  initial,
  saveLabel,
  busy,
  onSave,
  onCancel,
}: {
  initial: FormState;
  saveLabel: string;
  busy: boolean;
  onSave: (f: FormState) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState<FormState>(initial);
  const { fieldClass, fieldError, clear, validate } = useRequiredFields([
    { key: 'sop-title', label: 'Title', valid: f.title.trim().length > 0 },
    { key: 'sop-kind', label: 'Kind', valid: f.kind.length > 0 },
    { key: 'sop-url', label: 'Google Drive link', valid: f.url.trim().length > 0 },
  ]);

  return (
    <div className="space-y-3">
      <div>
        <label className="field-label field-label-required" htmlFor="sop-title">Title</label>
        <input
          id="sop-title"
          className={fieldClass('sop-title')}
          value={f.title}
          onChange={(e) => { setF({ ...f, title: e.target.value }); clear('sop-title'); }}
          placeholder="e.g. When a partner needs an MOU"
        />
        {fieldError('sop-title') && <p className="mt-1 text-xs text-priority-p1">{fieldError('sop-title')}</p>}
      </div>
      <div>
        <label className="field-label field-label-required" htmlFor="sop-kind">Kind</label>
        <select
          id="sop-kind"
          className={fieldClass('sop-kind')}
          value={f.kind}
          onChange={(e) => { setF({ ...f, kind: e.target.value }); clear('sop-kind'); }}
        >
          <option value="" disabled>Choose…</option>
          {SOP_KINDS.map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
          {/* Keep a doc's existing category selectable if it isn't one of the two kinds. */}
          {f.kind && !SOP_KINDS.includes(f.kind) && <option value={f.kind}>{f.kind}</option>}
        </select>
        <p className="mt-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
          <strong>How we work</strong>: how Sparrow does something. <strong>Using the portal</strong>: how to use this room’s screens.
        </p>
        {fieldError('sop-kind') && <p className="mt-1 text-xs text-priority-p1">{fieldError('sop-kind')}</p>}
      </div>
      <div>
        <label className="field-label field-label-required" htmlFor="sop-url">Google Drive link</label>
        <input
          id="sop-url"
          type="url"
          className={fieldClass('sop-url')}
          value={f.url}
          onChange={(e) => { setF({ ...f, url: e.target.value }); clear('sop-url'); }}
          placeholder="https://docs.google.com/…"
        />
        <p className="mt-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{SHARING_REMINDER}</p>
        {fieldError('sop-url') && <p className="mt-1 text-xs text-priority-p1">{fieldError('sop-url')}</p>}
      </div>
      <div>
        <label className="field-label" htmlFor="sop-desc">Short description</label>
        <input
          id="sop-desc"
          className="field-input"
          value={f.description}
          onChange={(e) => setF({ ...f, description: e.target.value })}
          placeholder="One line on when to use it (optional)"
        />
      </div>
      <div className="flex gap-2">
        <button onClick={() => { if (validate()) onSave(f); }} disabled={busy} className="btn-primary">
          {busy ? 'Saving…' : saveLabel}
        </button>
        <button onClick={onCancel} disabled={busy} className="btn-ghost">Cancel</button>
      </div>
    </div>
  );
}

function LinkPicker({
  room,
  alreadyShown,
  busy,
  onLink,
  onCancel,
}: {
  room: SopRoom;
  alreadyShown: string[];
  busy: boolean;
  onLink: (docId: string) => void;
  onCancel: () => void;
}) {
  const [docs, setDocs] = useState<OrgDocument[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picked, setPicked] = useState('');

  useEffect(() => {
    fetchLinkableDocs(room, alreadyShown)
      .then(setDocs)
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Could not load documents.'));
    // alreadyShown is a fresh array each render; the picker only needs it once on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  // Group by where each doc lives, Resource Library first.
  const groups = useMemo(() => {
    const map = new Map<string, OrgDocument[]>();
    for (const d of docs ?? []) {
      const home = sopRoomLabel(d.home_room);
      if (!map.has(home)) map.set(home, []);
      map.get(home)!.push(d);
    }
    return [...map.entries()].sort(([a], [b]) =>
      a === 'Resource Library' ? -1 : b === 'Resource Library' ? 1 : a.localeCompare(b),
    );
  }, [docs]);

  return (
    <div className="space-y-3">
      <div>
        <label className="field-label" htmlFor="sop-link">Show an existing doc in this room</label>
        {loadError ? (
          <p className="mt-1 text-sm text-priority-p1">{loadError}</p>
        ) : docs === null ? (
          <p className="mt-1 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Loading…</p>
        ) : docs.length === 0 ? (
          <p className="mt-1 text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Nothing else to link — every doc you can see is already here.</p>
        ) : (
          <select id="sop-link" className="field-input" value={picked} onChange={(e) => setPicked(e.target.value)}>
            <option value="" disabled>Choose a doc…</option>
            {groups.map(([home, items]) => (
              <optgroup key={home} label={home}>
                {items.map((d) => (
                  <option key={d.id} value={d.id}>{d.title}</option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
        <p className="mt-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
          It stays where it lives and is only edited there — this room just shows it too. {SHARING_REMINDER}
        </p>
      </div>
      <div className="flex gap-2">
        <button onClick={() => picked && onLink(picked)} disabled={busy || !picked} className="btn-primary">
          {busy ? 'Linking…' : 'Link'}
        </button>
        <button onClick={onCancel} disabled={busy} className="btn-ghost">Cancel</button>
      </div>
    </div>
  );
}
