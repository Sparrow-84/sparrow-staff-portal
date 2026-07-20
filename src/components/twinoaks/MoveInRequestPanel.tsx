import { useEffect, useState } from 'react';
import {
  approveLcpMoveInRequest,
  fetchMoveInRequestDetail,
  updateMoveInRequestNotes,
} from '@/lib/lcp';
import type { LcpMoveInRequest, LcpMoveInRequestDetail } from '@/lib/lcp-types';
import { Drawer } from '@/components/lcp/Drawer';

const APPROVE_MESSAGE: Record<string, string> = {
  already_approved: 'Already approved.',
  skipped_existing_tenant: 'This home already has an active resident record — not overwritten. Check the Property tab before approving.',
  not_found: 'Could not find this request.',
};

/**
 * Review drawer for a pending LCP move-in request. Shows the resident info
 * Shelly/Audrey entered on the LCP side (never program info — no session log,
 * curriculum position, etc.) so TOC staff can see it's happening, approve it
 * (creating the real tenant + household_members records), or flag a question
 * before approving. Approving is the only action that writes to tenants/
 * household_members — nothing happens automatically without this click.
 */
export function MoveInRequestPanel({
  open,
  request,
  onClose,
  onChanged,
}: {
  open: boolean;
  request: LcpMoveInRequest | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<LcpMoveInRequestDetail | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (open && request) {
      setDetail(null);
      setNotes(request.notes ?? '');
      setMessage(null);
      void fetchMoveInRequestDetail(request.id).then(setDetail);
    }
  }, [open, request]);

  if (!request) return null;

  async function approve() {
    setBusy(true);
    const result = await approveLcpMoveInRequest(request!.id);
    setBusy(false);
    if (result === 'approved') {
      onChanged();
      onClose();
    } else {
      setMessage(APPROVE_MESSAGE[result] ?? result);
    }
  }

  async function markNeedsInfo() {
    setBusy(true);
    await updateMoveInRequestNotes(request!.id, { status: 'needs_info', notes: notes.trim() || null });
    setBusy(false);
    onChanged();
    onClose();
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={request.family_display_name}
      subtitle={`Moving into ${request.space_label}`}
      footer={
        <div className="flex gap-2">
          <button onClick={approve} disabled={busy} className="btn-primary flex-1">
            {busy ? 'Working…' : 'Approve & create resident record'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="rounded-lg bg-sparrow-cream px-3 py-2 text-xs text-sparrow-ink">
          Only resident info moves over — name, phone, email, children's names, move-in date, emergency
          contact. Nothing about their LCP program (session log, curriculum position, etc.) is shared.
        </p>

        {!detail ? (
          <p className="text-sm text-sparrow-gray">Loading…</p>
        ) : (
          <>
            <div>
              <span className="field-label">Move-in date</span>
              <p className="text-sm text-sparrow-ink">{detail.move_in_date ?? '—'}</p>
            </div>

            <div>
              <span className="field-label">Household adults</span>
              <ul className="mt-1 space-y-2">
                {detail.adults.length === 0 && <li className="text-sm text-sparrow-gray">None on file.</li>}
                {detail.adults.map((a, i) => (
                  <li key={i} className="rounded-xl border border-sparrow-rule/70 p-3">
                    <p className="text-sm font-medium text-sparrow-ink">{a.full_name}</p>
                    <p className="text-xs text-sparrow-gray">{a.phone} · {a.email}</p>
                    <p className="text-xs text-sparrow-gray">Children: {a.children_names}</p>
                  </li>
                ))}
              </ul>
            </div>

            {detail.emergency_contact_notes && (
              <div>
                <span className="field-label">Emergency contact</span>
                <p className="text-sm text-sparrow-ink">{detail.emergency_contact_notes}</p>
              </div>
            )}
          </>
        )}

        <div className="border-t border-sparrow-rule pt-4">
          <span className="field-label">Notes / questions for LCP staff</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="e.g. Need annual income before we can set up the lease…"
            className="field-input"
          />
          <button onClick={markNeedsInfo} disabled={busy} className="btn-ghost mt-2 border border-sparrow-rule">
            Save note & mark needs info
          </button>
          <p className="mt-1 text-xs text-sparrow-gray">
            This shows up on the family's LCP record. For a real back-and-forth, message the LCP staff
            directly via chat or a task.
          </p>
        </div>

        {message && <p className="text-sm text-priority-p1">{message}</p>}
      </div>
    </Drawer>
  );
}
