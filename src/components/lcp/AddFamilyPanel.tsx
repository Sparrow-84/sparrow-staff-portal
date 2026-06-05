import { useEffect, useState } from 'react';
import { TOTAL_SESSIONS } from '@/lib/lcp-types';
import { createFamily } from '@/lib/lcp';
import { Drawer } from './Drawer';

export function AddFamilyPanel({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [session, setSession] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setEmail('');
      setSession(1);
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSave = name.trim().length > 0 && emailValid && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      await createFamily({
        display_name: name,
        login_email: email,
        current_session_number: Math.max(1, Math.min(TOTAL_SESSIONS, session)),
      });
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the family.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Add family"
      subtitle="Creates their LifeChange record and sign-in"
      footer={
        <button onClick={save} disabled={!canSave} className="btn-primary w-full">
          {busy ? 'Adding…' : 'Add family'}
        </button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="field-label" htmlFor="fam-name">
            Family name
          </label>
          <input
            id="fam-name"
            className="field-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Maria R."
          />
        </div>

        <div>
          <label className="field-label" htmlFor="fam-email">
            Sign-in email
          </label>
          <input
            id="fam-email"
            type="email"
            className="field-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="mother@example.com"
          />
          <p className="mt-1 text-xs text-sparrow-gray">
            The mother signs in to the participant portal with this email. It's also the
            allowlist — only this address can register for this family. One login per family.
          </p>
        </div>

        <div>
          <label className="field-label" htmlFor="fam-session">
            Starting session
          </label>
          <input
            id="fam-session"
            type="number"
            min={1}
            max={TOTAL_SESSIONS}
            className="field-input"
            value={session}
            onChange={(e) => setSession(Number(e.target.value) || 1)}
          />
          <p className="mt-1 text-xs text-sparrow-gray">
            Rotating-door entry — start them wherever the group currently is (of {TOTAL_SESSIONS}).
            Adjustable later from the family's Progress tab.
          </p>
        </div>

        {error && <p className="text-sm text-priority-p1">{error}</p>}
      </div>
    </Drawer>
  );
}
