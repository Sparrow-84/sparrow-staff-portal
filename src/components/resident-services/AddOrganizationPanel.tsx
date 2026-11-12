import { useEffect, useState } from 'react';
import { Drawer } from '../lcp/Drawer';
import {
  ORG_KINDS,
  addOrganization,
  findSimilarOrganizations,
  linkOrganization,
  type OrgKind,
  type SimilarOrganization,
} from '@/lib/resident-services';

export type AddOrgResult =
  | { kind: 'new' | 'linked'; id: string; name: string }
  | { kind: 'already'; id: string; name: string };

/**
 * Resident Services adds an organization to the Directory itself (migration 0222).
 *
 * Before anything is created, the whole Directory is checked for a likely match (typos,
 * initials, same phone, same website), and the person has to pick one: "Use this one" or
 * "None of these — add a new organization". Either way the Partnerships room admin gets a
 * task (also on Partnerships Home).
 *
 * mode 'room': from the room's "+ Add an organization" -- the organization lands in "To review".
 * mode 'program': from "Can't find it?" inside "+ Add a program" -- it's picked for that program.
 */
export function AddOrganizationPanel({
  open,
  mode,
  onClose,
  onDone,
}: {
  open: boolean;
  mode: 'room' | 'program';
  onClose: () => void;
  onDone: (result: AddOrgResult) => void;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<OrgKind | ''>('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [address, setAddress] = useState('');
  const [matches, setMatches] = useState<SimilarOrganization[]>([]);
  const [available, setAvailable] = useState(true);
  // The inputs the last finished check was run on: "Add" waits until it matches what's typed.
  const [checkedKey, setCheckedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(''); setKind(''); setPhone(''); setWebsite(''); setAddress('');
    setMatches([]); setCheckedKey(null); setBusy(false); setError(null); setTried(false);
  }, [open]);

  const key = JSON.stringify([name.trim(), phone.trim(), website.trim()]);
  const hasSomething = name.trim().length >= 2 || phone.replace(/\D/g, '').length >= 7 || website.trim().length >= 4;

  // Check the Directory a moment after typing stops.
  useEffect(() => {
    if (!open || !hasSomething) { setMatches([]); setCheckedKey(null); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      void findSimilarOrganizations(name.trim(), phone.trim(), website.trim()).then((res) => {
        if (cancelled) return;
        setAvailable(res.available);
        setMatches(res.matches);
        setCheckedKey(key);
      });
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);

  const checked = checkedKey === key && hasSomething;
  const openReview = mode === 'room';

  const useExisting = async (m: SimilarOrganization) => {
    if (mode === 'room' && m.in_resident_services) {
      onDone({ kind: 'already', id: m.id, name: m.name });
      return;
    }
    setBusy(true); setError(null);
    try {
      await linkOrganization(m.id, openReview);
      onDone({ kind: 'linked', id: m.id, name: m.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect it.');
      setBusy(false);
    }
  };

  const addNew = async () => {
    setTried(true);
    if (!name.trim() || !kind || !checked) return;
    setBusy(true); setError(null);
    try {
      const id = await addOrganization({ name: name.trim(), kind, phone: phone.trim(), website: website.trim(), address: address.trim(), openReview });
      onDone({ kind: 'new', id, name: name.trim() });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add it.');
      setBusy(false);
    }
  };

  const err = (bad: boolean) => (tried && bad ? ' field-input-error' : '');

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Add an organization"
      subtitle={mode === 'room'
        ? 'It goes into the Directory, and into "To review" here so you can add its programs'
        : 'It goes into the Directory and is picked for this program'}
      footer={
        <div className="space-y-2">
          {!available && (
            <p className="text-sm text-amber-800 dark:text-amber-200">
              This is waiting on a database update (migration 0222). Until then, ask Partnerships to add the organization.
            </p>
          )}
          {tried && (!name.trim() || !kind) && <p className="text-sm text-priority-p1">Type the name and pick what kind of organization it is.</p>}
          {error && <p className="text-sm text-priority-p1">{error}</p>}
          <button
            onClick={() => void addNew()}
            disabled={busy || !available || !checked}
            className="btn-primary w-full"
            title={!checked ? 'Checking the Directory first…' : undefined}
          >
            {busy ? 'Saving…' : matches.length > 0 ? 'None of these — add a new organization' : 'Add organization'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="field-label field-label-required">Organization name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={`field-input${err(!name.trim())}`} placeholder="e.g. South Corvallis Food Bank" autoFocus />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Phone</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="field-input" placeholder="Their main number" />
          </label>
          <label className="block">
            <span className="field-label">Website</span>
            <input value={website} onChange={(e) => setWebsite(e.target.value)} className="field-input" placeholder="e.g. example.org" />
          </label>
        </div>
        <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
          Adding the phone or website helps find it if it's already in the Directory under another name.
        </p>

        {/* The match check: always shown before anything can be added. */}
        {hasSomething && (
          <section className="rounded-xl border border-amber-300 bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-500/10 p-3">
            {!checked ? (
              <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray">Checking the Directory…</p>
            ) : matches.length === 0 ? (
              <p className="text-sm">Nothing like it is in the Directory. You can add it.</p>
            ) : (
              <>
                <p className="text-sm font-medium">Is it one of these? It may already be in the Directory.</p>
                <ul className="mt-2 space-y-1.5">
                  {matches.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-white dark:bg-sparrow-dark-surface px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{m.name}</span>
                        <span className="block text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                          {m.reason}
                          {m.in_resident_services ? ' · already in Resident Services' : ''}
                          {m.inactive ? ' · inactive in Partnerships' : ''}
                        </span>
                      </span>
                      <button type="button" onClick={() => void useExisting(m)} disabled={busy} className="btn-secondary px-2.5 py-1 text-xs">
                        {mode === 'room' && m.in_resident_services ? "It's already here" : 'Use this one'}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        <label className="block">
          <span className="field-label field-label-required">What kind of organization is it?</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as OrgKind)} className={`field-input${err(!kind)}`}>
            <option value="" disabled>Pick one…</option>
            {ORG_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="field-label">Office address</span>
          <input value={address} onChange={(e) => setAddress(e.target.value)} className="field-input" placeholder="Optional. Where people go for help is added with each program." />
        </label>
        <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
          Partnerships staff are told when you add or connect an organization, and they finish its Directory record.
        </p>
      </div>
    </Drawer>
  );
}
