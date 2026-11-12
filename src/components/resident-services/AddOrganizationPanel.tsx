import { useEffect, useState } from 'react';
import { Drawer } from '../lcp/Drawer';
import {
  addOrganization,
  findSimilarOrganizations,
  linkOrganization,
  type SimilarOrganization,
} from '@/lib/resident-services';

export type AddOrgResult =
  | { kind: 'new' | 'linked'; id: string; name: string }
  | { kind: 'already'; id: string; name: string };

/**
 * Resident Services adds an organization to the Directory itself (migration 0222), one
 * step at a time (designed with Susanna 2026-11-12) so the match check can't be missed:
 *
 *   1. Only three boxes: name, main phone number, website.
 *   2. "Check the Directory for matches". The answer appears under the button: either
 *      "Similar listings found. Is it one of these?" (pick one → "Use this one") or
 *      "No similar records found." Either way "Add as a new organization" is there.
 *      Changing a box after checking clears the answer, so nothing is added on an old check.
 *   3. Only after that choice does the organization open (handled by the room): its own
 *      page to add programs, or back to the program being added.
 *
 * mode 'room': from the room's "+ Add an organization".
 * mode 'program': from "Can't find it?" inside "+ Add a program".
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
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  // The answer to the last check, and the boxes it was run on.
  const [result, setResult] = useState<{ key: string; matches: SimilarOrganization[] } | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(''); setPhone(''); setWebsite('');
    setResult(null); setPicked(null); setChecking(false); setBusy(false); setError(null);
  }, [open]);

  const key = JSON.stringify([name.trim(), phone.trim(), website.trim()]);
  // Changing a box after a check clears the answer: they check again.
  useEffect(() => {
    if (result && result.key !== key) { setResult(null); setPicked(null); }
  }, [key, result]);

  const check = async () => {
    if (!name.trim()) return;
    setChecking(true); setError(null); setPicked(null);
    const res = await findSimilarOrganizations(name.trim(), phone.trim(), website.trim());
    setAvailable(res.available);
    setResult(res.available ? { key, matches: res.matches } : null);
    setChecking(false);
  };

  const useExisting = async () => {
    const m = result?.matches.find((x) => x.id === picked);
    if (!m) return;
    if (mode === 'room' && m.in_resident_services) {
      onDone({ kind: 'already', id: m.id, name: m.name });
      return;
    }
    setBusy(true); setError(null);
    try {
      await linkOrganization(m.id, mode === 'room');
      onDone({ kind: 'linked', id: m.id, name: m.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect it.');
      setBusy(false);
    }
  };

  const addNew = async () => {
    setBusy(true); setError(null);
    try {
      const id = await addOrganization({
        name: name.trim(), phone: phone.trim(), website: website.trim(), openReview: mode === 'room',
      });
      onDone({ kind: 'new', id, name: name.trim() });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add it.');
      setBusy(false);
    }
  };

  const matches = result?.matches ?? [];

  return (
    <Drawer open={open} onClose={onClose} title="Add an organization" subtitle="First, check whether the Directory already has it">
      <div className="space-y-4">
        <label className="block">
          <span className="field-label field-label-required">Organization name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="field-input" placeholder="e.g. South Corvallis Food Bank" autoFocus />
        </label>
        <label className="block">
          <span className="field-label">Main phone number</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="field-input" placeholder="Optional" />
        </label>
        <label className="block">
          <span className="field-label">Website</span>
          <input value={website} onChange={(e) => setWebsite(e.target.value)} className="field-input" placeholder="Optional, e.g. example.org" />
        </label>
        <p className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
          The phone number and website help find it if the Directory has it under a different name.
        </p>

        <button onClick={() => void check()} disabled={!name.trim() || checking || busy} className="btn-primary w-full">
          {checking ? 'Checking…' : 'Check the Directory for matches'}
        </button>

        {!available && (
          <p className="text-sm text-amber-800 dark:text-amber-200">
            This is waiting on a database update (migration 0222). Until then, ask Partnerships to add the organization.
          </p>
        )}

        {result && (
          <section className="space-y-3 rounded-xl border border-sparrow-rule dark:border-sparrow-dark-border p-3">
            {matches.length === 0 ? (
              <p className="text-sm font-medium">No similar records found.</p>
            ) : (
              <>
                <p className="text-sm font-medium">Similar listings found. Is it one of these?</p>
                <div className="space-y-1.5" role="radiogroup" aria-label="Similar listings">
                  {matches.map((m) => (
                    <label
                      key={m.id}
                      className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm transition ${
                        picked === m.id
                          ? 'border-sparrow-green bg-sparrow-green/5 dark:border-sparrow-dark-green'
                          : 'border-sparrow-rule dark:border-sparrow-dark-border hover:border-sparrow-green'
                      }`}
                    >
                      <input
                        type="radio"
                        name="rs-org-match"
                        checked={picked === m.id}
                        onChange={() => setPicked(m.id)}
                        className="mt-0.5 h-4 w-4 accent-sparrow-green"
                      />
                      <span className="min-w-0">
                        <span className="font-medium">{m.name}</span>
                        <span className="block text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
                          {m.reason}
                          {m.in_resident_services ? ' · already in Resident Services' : ''}
                          {m.inactive ? ' · inactive in Partnerships' : ''}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                <button onClick={() => void useExisting()} disabled={!picked || busy} className="btn-primary w-full">
                  Use this one
                </button>
              </>
            )}
            <button onClick={() => void addNew()} disabled={busy} className="btn-secondary w-full">
              {busy ? 'Saving…' : 'Add as a new organization'}
            </button>
            {error && <p className="text-sm text-priority-p1">{error}</p>}
          </section>
        )}
      </div>
    </Drawer>
  );
}
