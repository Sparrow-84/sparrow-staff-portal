import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  addOrgAddress,
  addressLine,
  deleteOrgAddress,
  fetchOrgAddresses,
  updateOrgAddress,
  type AddressInput,
  type OrgAddress,
} from '@/lib/locations';

/**
 * An organization's addresses (migration 0224): one labeled list, shared by the Directory
 * record (Partnerships) and Resident Services. A private location stores the city only.
 * Before 0224 runs, `fallback` (the old single address field) is shown instead.
 */
export function OrgAddresses({
  partnerId,
  fallback,
  onChanged,
}: {
  partnerId: string;
  fallback?: ReactNode;
  onChanged?: () => void;
}) {
  const [addresses, setAddresses] = useState<OrgAddress[]>([]);
  const [available, setAvailable] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetchOrgAddresses(partnerId);
    setAddresses(res.addresses);
    setAvailable(res.available);
  }, [partnerId]);

  useEffect(() => { setAdding(false); setEditingId(null); void load(); }, [load]);

  if (!available) return <>{fallback ?? null}</>;

  const changed = async () => { await load(); onChanged?.(); };

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-sparrow-gray dark:text-sparrow-dark-gray">Addresses</span>
        {!adding && (
          <button type="button" onClick={() => { setAdding(true); setEditingId(null); }} className="text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green hover:underline">
            + Add an address
          </button>
        )}
      </div>
      {addresses.length === 0 && !adding && (
        <p className="text-sm text-sparrow-gray/70 dark:text-sparrow-dark-gray/70">None yet.</p>
      )}
      {addresses.map((a) => editingId === a.id ? (
        <AddressForm
          key={a.id}
          initial={a}
          onCancel={() => setEditingId(null)}
          onSave={async (input) => { await updateOrgAddress(a.id, input); setEditingId(null); await changed(); }}
          onRemove={async () => { await deleteOrgAddress(a.id); setEditingId(null); await changed(); }}
        />
      ) : (
        <div
          key={a.id}
          className={`flex items-start justify-between gap-3 rounded-lg px-3 py-2 text-sm ${
            a.is_private ? 'bg-purple-50 dark:bg-purple-500/10' : 'border border-sparrow-rule dark:border-sparrow-dark-border'
          }`}
        >
          <span className="min-w-0">
            <span className="block font-medium">{a.label}</span>
            <span className="block select-text text-xs text-sparrow-gray dark:text-sparrow-dark-gray">{addressLine(a)}</span>
          </span>
          <button type="button" onClick={() => { setEditingId(a.id); setAdding(false); }} className="shrink-0 text-xs text-sparrow-gray dark:text-sparrow-dark-gray hover:text-sparrow-green hover:underline">
            Edit
          </button>
        </div>
      ))}
      {adding && (
        <AddressForm
          onCancel={() => setAdding(false)}
          onSave={async (input) => { await addOrgAddress(partnerId, input); setAdding(false); await changed(); }}
        />
      )}
    </div>
  );
}

/** Add or edit one address. Ticking "private" removes the street box: only the city is saved. */
export function AddressForm({
  initial,
  onSave,
  onCancel,
  onRemove,
}: {
  initial?: Pick<OrgAddress, 'label' | 'street' | 'city' | 'is_private'>;
  onSave: (input: AddressInput) => Promise<void>;
  onCancel: () => void;
  onRemove?: () => Promise<void>;
}) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [street, setStreet] = useState(initial?.street ?? '');
  const [city, setCity] = useState(initial?.city ?? '');
  const [isPrivate, setIsPrivate] = useState(initial?.is_private ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const missingLabel = !label.trim();
  const missingPlace = isPrivate ? !city.trim() : !(street.trim() || city.trim());

  const save = async () => {
    setTried(true);
    if (missingLabel || missingPlace) return;
    setBusy(true); setError(null);
    try {
      await onSave({ label: label.trim(), street: isPrivate ? '' : street.trim(), city: city.trim(), is_private: isPrivate });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the address.');
      setBusy(false);
    }
  };

  const err = (bad: boolean) => (tried && bad ? ' field-input-error' : '');

  return (
    <div className="space-y-2.5 rounded-xl border border-sparrow-gold bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-500/10 p-3">
      <label className="block">
        <span className="field-label field-label-required">What is this address?</span>
        <input value={label} onChange={(e) => setLabel(e.target.value)} className={`field-input${err(missingLabel)}`} placeholder="e.g. Corvallis Office, Food pantry, Shelter" />
      </label>
      {!isPrivate && (
        <label className="block">
          <span className="field-label">Street address</span>
          <input value={street} onChange={(e) => setStreet(e.target.value)} className={`field-input${err(missingPlace)}`} placeholder="e.g. 257 SW Madison Ave" />
        </label>
      )}
      <label className="block">
        <span className={`field-label${isPrivate ? ' field-label-required' : ''}`}>City</span>
        <input value={city} onChange={(e) => setCity(e.target.value)} className={`field-input${err(isPrivate ? !city.trim() : missingPlace)}`} placeholder="e.g. Corvallis" />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} className="mt-0.5 h-4 w-4 accent-sparrow-green" />
        <span>
          This location is private
          <span className="block text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
            For a shelter or anywhere people's safety depends on it. Only the city is saved, so the street can't be printed, published or seen.
          </span>
        </span>
      </label>
      {tried && (missingLabel || missingPlace) && (
        <p className="text-xs text-priority-p1">{missingLabel ? 'Say what this address is. ' : ''}{missingPlace ? (isPrivate ? 'Add the city.' : 'Add the street or the city.') : ''}</p>
      )}
      {error && <p className="text-xs text-priority-p1">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {onRemove && !confirmRemove && (
          <button type="button" onClick={() => setConfirmRemove(true)} className="mr-auto text-xs font-medium text-priority-p1 hover:underline">
            Remove this address
          </button>
        )}
        {onRemove && confirmRemove && (
          <span className="mr-auto flex flex-wrap items-center gap-2 text-xs">
            Remove it? Programs that use it lose it.
            <button type="button" onClick={() => setConfirmRemove(false)} className="btn-secondary px-2 py-1 text-xs">Keep it</button>
            <button
              type="button"
              disabled={busy}
              onClick={() => { setBusy(true); void onRemove().catch((e) => { setError(e instanceof Error ? e.message : 'Could not remove it.'); setBusy(false); }); }}
              className="rounded-lg bg-priority-p1 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              Remove it
            </button>
          </span>
        )}
        <span className={onRemove ? '' : 'ml-auto'} />
        <button type="button" onClick={onCancel} className="btn-secondary px-3 py-1.5 text-sm">Cancel</button>
        <button type="button" onClick={() => void save()} disabled={busy} className="btn-primary">{initial ? 'Save' : 'Add address'}</button>
      </div>
    </div>
  );
}
