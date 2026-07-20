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
  const [adultEmail, setAdultEmail] = useState('');
  const [childrenNames, setChildrenNames] = useState('');
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
      setAdultEmail('');
      setChildrenNames('');
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const adultEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adultEmail.trim());
  const canSave =
    name.trim().length > 0 &&
    emailValid &&
    emergencyContact.trim().length > 0 &&
    adultName.trim().length > 0 &&
    adultPhone.trim().length > 0 &&
    adultEmailValid &&
    childrenNames.trim().length > 0 &&
    !busy;

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
        adult: { full_name: adultName, phone: adultPhone, email: adultEmail, children_names: childrenNames },
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

        <div className="border-t border-sparrow-rule pt-4">
          <span className="field-label">Adult in the home</span>
          <input
            className="field-input"
            value={adultName}
            onChange={(e) => setAdultName(e.target.value)}
            placeholder="Full name"
          />
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input
              className="field-input mt-0"
              value={adultPhone}
              onChange={(e) => setAdultPhone(e.target.value)}
              placeholder="Phone"
            />
            <input
              type="email"
              className="field-input mt-0"
              value={adultEmail}
              onChange={(e) => setAdultEmail(e.target.value)}
              placeholder="Email"
            />
          </div>
          <input
            className="field-input mt-2"
            value={childrenNames}
            onChange={(e) => setChildrenNames(e.target.value)}
            placeholder="Children's full names"
          />
          <p className="mt-1 text-xs text-sparrow-gray">
            More adults can be added later from the family's General Info tab.
          </p>
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
