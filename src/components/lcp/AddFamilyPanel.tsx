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
  const [emergencyContact, setEmergencyContact] = useState('');
  const [adultName, setAdultName] = useState('');
  const [adultPhone, setAdultPhone] = useState('');
  const [children, setChildren] = useState<string[]>(['']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setEmail('');
      setSession(1);
      setEmergencyContact('');
      setAdultName('');
      setAdultPhone('');
      setChildren(['']);
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSave =
    name.trim().length > 0 &&
    emailValid &&
    emergencyContact.trim().length > 0 &&
    adultName.trim().length > 0 &&
    adultPhone.trim().length > 0 &&
    !busy;

  function setChild(i: number, value: string) {
    setChildren((cs) => cs.map((c, idx) => (idx === i ? value : c)));
  }
  function addChildRow() {
    setChildren((cs) => [...cs, '']);
  }
  function removeChildRow(i: number) {
    setChildren((cs) => cs.filter((_, idx) => idx !== i));
  }

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      await createFamily({
        display_name: name,
        login_email: email,
        current_session_number: Math.max(1, Math.min(TOTAL_SESSIONS, session)),
        emergency_contact_notes: emergencyContact,
        adult: { full_name: adultName, phone: adultPhone },
        children,
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
            Household name <span className="font-normal text-sparrow-gray">(last name)</span>
          </label>
          <input
            id="fam-name"
            className="field-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Wenger"
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
            The mother signs in to the participant portal with this email, and it's also her
            contact email — no separate email needed below. It's also the allowlist — only
            this address can register for this family. One login per family.
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

        <div className="border-t border-sparrow-rule pt-4">
          <span className="field-label">Mother</span>
          <input
            className="field-input"
            value={adultName}
            onChange={(e) => setAdultName(e.target.value)}
            placeholder="Full name"
          />
          <input
            className="field-input mt-2"
            value={adultPhone}
            onChange={(e) => setAdultPhone(e.target.value)}
            placeholder="Phone"
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <span className="field-label">Children</span>
            <button type="button" onClick={addChildRow} className="text-xs font-medium text-sparrow-green">
              + Add child
            </button>
          </div>
          <div className="mt-1 space-y-2">
            {children.map((c, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className="field-input mt-0 flex-1"
                  value={c}
                  onChange={(e) => setChild(i, e.target.value)}
                  placeholder="Full name"
                />
                {children.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeChildRow(i)}
                    className="shrink-0 text-xs text-sparrow-gray hover:text-priority-p1"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="fam-emergency">
            Emergency contact
          </label>
          <textarea
            id="fam-emergency"
            rows={2}
            className="field-input"
            value={emergencyContact}
            onChange={(e) => setEmergencyContact(e.target.value)}
            placeholder="Name, relationship, phone number"
          />
        </div>

        {error && <p className="text-sm text-priority-p1">{error}</p>}
      </div>
    </Drawer>
  );
}
