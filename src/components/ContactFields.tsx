import type { PersonalContactInput } from '@/lib/personalContacts';

export function ContactFields({ form, onChange }: { form: PersonalContactInput; onChange: (f: PersonalContactInput) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <label className="field-label field-label-required">Name</label>
        <input
          className="field-input w-full"
          required
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
        />
      </div>
      <div className="col-span-2">
        <label className="field-label">Organization / context</label>
        <input
          className="field-input w-full"
          placeholder="How does this org or context relate to Sparrow?"
          value={form.organization}
          onChange={(e) => onChange({ ...form, organization: e.target.value })}
        />
      </div>
      <div className="col-span-2">
        <label className="field-label">How you're connected</label>
        <input
          className="field-input w-full"
          placeholder="e.g. former coworker, church contact, family friend"
          value={form.relationship}
          onChange={(e) => onChange({ ...form, relationship: e.target.value })}
        />
      </div>
      <div>
        <label className="field-label">Phone</label>
        <input
          className="field-input w-full"
          value={form.phone}
          onChange={(e) => onChange({ ...form, phone: e.target.value })}
        />
      </div>
      <div>
        <label className="field-label">Email</label>
        <input
          type="email"
          className="field-input w-full"
          value={form.email}
          onChange={(e) => onChange({ ...form, email: e.target.value })}
        />
      </div>
      <div className="col-span-2">
        <label className="field-label">Notes</label>
        <textarea
          className="field-input w-full"
          rows={2}
          value={form.notes}
          onChange={(e) => onChange({ ...form, notes: e.target.value })}
        />
      </div>
    </div>
  );
}
