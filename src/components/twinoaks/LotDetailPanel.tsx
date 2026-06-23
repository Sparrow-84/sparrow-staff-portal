import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { useAuth } from '@/auth/AuthContext';
import {
  HOME_OWNERSHIPS,
  NOTICE_COLOR,
  NOTICE_DELIVERIES,
  NOTICE_TYPES,
  PET_TYPES,
  SPACE_TYPES,
  TITLE_HOLDERS,
  availabilityOptions,
  highestNoticeType,
  type HomeDesignation,
  type HomeOwnership,
  type NoticeDelivery,
  type NoticeType,
  type Pet,
  type PetType,
  type Space,
  type SpaceStatus,
  type SpaceType,
  type Tenant,
  type TitleHolder,
} from '@/lib/housing-types';
import {
  archiveMember,
  createNotice,
  createTenant,
  deleteNotice,
  fetchHouseholdMembers,
  fetchNoticesForSpace,
  fetchPets,
  moveOutTenant,
  syncHouseholdMembers,
  syncPets,
  updateMemberTenantLinks,
  updateSpace,
  updateTenant,
  uploadLotPhoto,
  type LotNoticeWithCreator,
  type MemberDraft,
  type PetDraft,
  type WorkOrderWithAssignee,
} from '@/lib/housing';
import type { HouseholdMember } from '@/lib/housing-types';

interface Props {
  open: boolean;
  space: Space | null;
  tenant: Tenant | null;
  workOrders: WorkOrderWithAssignee[];
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
  onNoticeChange?: () => void;
  onNewWorkOrder: (spaceId: string) => void;
  onSelectWorkOrder: (wo: WorkOrderWithAssignee) => void;
}

// ── Tooltip ───────────────────────────────────────────────────────────
function Info({ tip }: { tip: string }) {
  return (
    <span className="group relative ml-1 inline-block align-middle">
      <span className="cursor-default text-[10px] text-sparrow-gray">ⓘ</span>
      <span className="pointer-events-none absolute top-full left-0 z-50 mt-1.5 w-56 rounded-lg bg-sparrow-ink px-3 py-2 text-xs leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {tip}
      </span>
    </span>
  );
}

function Field({ label, tip, children }: { label: string; tip?: string; children: ReactNode }) {
  return (
    <div>
      <p className="field-label">
        {label}
        {tip && <Info tip={tip} />}
      </p>
      {children}
    </div>
  );
}

function SectionHead({ label }: { label: string }) {
  return (
    <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-sparrow-gray">
      {label}
    </p>
  );
}

function PillGroup<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`rounded-full border px-3 py-0.5 text-xs font-medium transition disabled:opacity-40 ${
            value === o.value
              ? 'border-sparrow-green bg-sparrow-green text-white'
              : 'border-sparrow-rule bg-white text-sparrow-gray hover:border-sparrow-green/50 hover:text-sparrow-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

type PanelMode = 'view' | 'edit' | 'lot-edit';

const DESIGNATIONS: { value: HomeDesignation; label: string; description: string }[] = [
  { value: 'lcp', label: 'LCP home',          description: 'An LCP participant is placed here. House name will show on the grid.' },
  { value: 'sv',  label: 'Service Volunteer',  description: '"SV" will show on the grid square.' },
  { value: 'pm',  label: 'Property Manager',   description: '"PM" will show on the grid square.' },
  { value: 'other', label: 'Other',            description: 'Type a label — it will show on the grid square.' },
];

// Ownership options shown when LCP is selected (resident-owned never applies)
const LCP_OWNERSHIPS = HOME_OWNERSHIPS.filter((o) => o.value !== 'resident_owned');

export function LotDetailPanel({
  open,
  space,
  tenant,
  workOrders,
  canManage,
  onClose,
  onChanged,
  onNoticeChange,
  onNewWorkOrder,
  onSelectWorkOrder,
}: Props) {
  const { profile } = useAuth();
  const [mode, setMode] = useState<PanelMode>('view');
  const [prevMode, setPrevMode] = useState<PanelMode>('view');
  const [pending, startTransition] = useTransition();
  const [lotPending, startLotTransition] = useTransition();
  const [noticePending, startNoticeTransition] = useTransition();
  const [moveOutPending, startMoveOutTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lotError, setLotError] = useState<string | null>(null);
  const [showMoveOut, setShowMoveOut] = useState(false);
  const [showNoticeForm, setShowNoticeForm] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // ── Related data ─────────────────────────────────────────────────
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [memberDrafts, setMemberDrafts] = useState<MemberDraft[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [petDrafts, setPetDrafts] = useState<PetDraft[]>([]);
  const [notices, setNotices] = useState<LotNoticeWithCreator[]>([]);

  const loadRelated = useCallback(async (spaceId: string) => {
    try {
      const [m, p, n] = await Promise.all([
        fetchHouseholdMembers(spaceId),
        fetchPets(spaceId).catch(() => [] as Pet[]),
        fetchNoticesForSpace(spaceId).catch(() => [] as LotNoticeWithCreator[]),
      ]);
      setMembers(m);
      setMemberDrafts(m.map((hm) => ({ id: hm.id, tenant_id: hm.tenant_id, name: hm.name, phone: hm.phone ?? '', email: hm.email ?? '', park_chat_opt_in: hm.park_chat_opt_in })));
      setPets(p);
      setPetDrafts(p.map((pt) => ({ id: pt.id, pet_type: pt.pet_type, name: pt.name ?? '', notes: pt.notes ?? '' })));
      setNotices(n);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    if (space?.id) void loadRelated(space.id);
    setMode('view');
    setError(null);
    setLotError(null);
    setShowMoveOut(false);
    setShowNoticeForm(false);
  }, [space?.id, loadRelated]);

  // ── Designation & ownership ──────────────────────────────────────
  const [hasDesignation, setHasDesignation] = useState(false);
  const [designation, setDesignation] = useState<HomeDesignation>('lcp');
  const [designationLabel, setDesignationLabel] = useState('');
  const [ownership, setOwnership] = useState<HomeOwnership>('resident_owned');

  // ── Resident/household fields ────────────────────────────────────
  const [householdLabel, setHouseholdLabel] = useState('');
  const [children, setChildren] = useState('0');
  const [childrenNames, setChildrenNames] = useState('');
  const [ecNotes, setEcNotes] = useState('');
  const [moveIn, setMoveIn] = useState('');
  const [residentNotes, setResidentNotes] = useState('');

  // ── Home fields ──────────────────────────────────────────────────
  const [type, setType] = useState<SpaceType>('manufactured_home');
  const [vin, setVin] = useState('');
  const [hudLabel, setHudLabel] = useState('');
  const [titleHolder, setTitleHolder] = useState<TitleHolder | ''>('');

  // ── Lot fields ───────────────────────────────────────────────────
  const [status, setStatus] = useState<SpaceStatus>('vacant');
  const [rent, setRent] = useState('');
  const [ahd, setAhd] = useState(false);
  const [dimensions, setDimensions] = useState('');
  const [streetNumber, setStreetNumber] = useState('');
  const [streetName, setStreetName] = useState('');
  const [lotNotes, setLotNotes] = useState('');

  // ── Notice form fields ───────────────────────────────────────────
  const [noticeType, setNoticeType] = useState<NoticeType>('1');
  const [noticeDate, setNoticeDate] = useState('');
  const [noticeDesc, setNoticeDesc] = useState('');
  const [noticeDelivery, setNoticeDelivery] = useState<NoticeDelivery>('in_person');
  const [noticeDeliveryNotes, setNoticeDeliveryNotes] = useState('');
  const [noticeError, setNoticeError] = useState<string | null>(null);

  const isLcp = hasDesignation && designation === 'lcp';
  const isProgramHome = ownership === 'sparrow_owned' || ownership === 'donated_use';
  const residentLabel = isLcp ? 'Participant' : 'Resident';

  function populateAll() {
    if (space) {
      const des = space.designation_type;
      setHasDesignation(!!des);
      setDesignation(des ?? 'lcp');
      setDesignationLabel(space.designation_label ?? '');
      setOwnership(space.ownership ?? 'resident_owned');
      setType(space.type);
      setVin(space.vin ?? '');
      setHudLabel(space.hud_label ?? '');
      setTitleHolder(space.title_holder ?? '');
      setStatus(space.status === 'maintenance' ? 'occupied' : space.status);
      setRent(String(space.current_rent ?? ''));
      setAhd(space.affordable_housing_discount ?? false);
      setDimensions(space.size ?? '');
      setStreetNumber(space.street_number ?? '');
      setStreetName(space.street_name ?? '');
      setLotNotes(space.notes ?? '');
    }
    setHouseholdLabel(tenant?.name ?? '');
    setChildren(String(tenant?.children ?? 0));
    setChildrenNames(tenant?.children_names ?? '');
    setEcNotes(tenant?.emergency_contact_notes ?? '');
    setMoveIn(tenant?.move_in_date ?? '');
    setResidentNotes(tenant?.notes ?? '');
    setError(null);
    setLotError(null);
  }

  useEffect(() => { populateAll(); }, [space, tenant]); // eslint-disable-line react-hooks/exhaustive-deps

  function clearForm() {
    setHouseholdLabel('');
    setChildren('0');
    setChildrenNames('');
    setEcNotes('');
    setMoveIn('');
    setResidentNotes('');
    setMemberDrafts([]);
    setPetDrafts([]);
  }

  function resetLotFields() {
    if (space) {
      setStatus(space.status === 'maintenance' ? 'occupied' : space.status);
      setRent(String(space.current_rent ?? ''));
      setAhd(space.affordable_housing_discount ?? false);
      setDimensions(space.size ?? '');
      setStreetNumber(space.street_number ?? '');
      setStreetName(space.street_name ?? '');
      setLotNotes(space.notes ?? '');
    }
    setLotError(null);
  }

  function enterLotEdit() {
    setPrevMode(mode);
    setMode('lot-edit');
  }

  function cancelLotEdit() {
    resetLotFields();
    setMode(prevMode);  // return to wherever user came from — does NOT reset resident/home fields
  }

  // ── Member helpers ───────────────────────────────────────────────
  const addMember = () => setMemberDrafts((p) => [...p, { name: '', phone: '', email: '', park_chat_opt_in: false }]);
  const removeMember = (i: number) => setMemberDrafts((p) => p.filter((_, idx) => idx !== i));
  const updateMember = (i: number, patch: Partial<MemberDraft>) =>
    setMemberDrafts((p) => p.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));

  async function archiveMemberById(memberId: string, name: string) {
    if (!window.confirm(`Mark ${name || 'this person'} as moved out? They will be removed from this household. Their record will be preserved in the archive.`)) return;
    try {
      await archiveMember(memberId);
      if (space) await loadRelated(space.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not archive member.';
      setError(msg.includes('schema cache') ? 'Database error — try refreshing the page. If this persists, ask Byron to reload the schema cache in the Supabase dashboard.' : msg);
    }
  }

  // ── Pet helpers ──────────────────────────────────────────────────
  const addPet = () => setPetDrafts((p) => [...p, { pet_type: 'dog', name: '', notes: '' }]);
  const removePet = (i: number) => setPetDrafts((p) => p.filter((_, idx) => idx !== i));
  const updatePet = (i: number, patch: Partial<PetDraft>) =>
    setPetDrafts((p) => p.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));

  // ── Photo upload ─────────────────────────────────────────────────
  async function handlePhotoUpload(file: File) {
    if (!space) return;
    setPhotoUploading(true);
    setPhotoError(null);
    try {
      const url = await uploadLotPhoto(space.id, file);
      await updateSpace(space.id, { photo_url: url });
      onChanged();
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setPhotoUploading(false);
    }
  }

  // ── Save resident + home ─────────────────────────────────────────
  function save() {
    if (!space) return;
    startTransition(async () => {
      try {
        const desType = hasDesignation ? designation : null;
        const desLabel = hasDesignation
          ? (designation === 'lcp' || designation === 'other') ? (designationLabel.trim() || null) : null
          : null;

        await updateSpace(space.id, {
          ownership,
          designation_type: desType,
          designation_label: desLabel,
          type,
          vin: vin.trim() || null,
          hud_label: hudLabel.trim() || null,
          title_holder: ownership === 'resident_owned' ? (titleHolder || null) : null,
        });

        const childrenCount = Number(children) || 0;
        const memberCount = memberDrafts.filter((d) => d.name.trim()).length;
        const residentPatch = {
          name: householdLabel.trim(),
          household_size: memberCount + childrenCount,
          status: (status === 'reserved' ? 'applicant' : status === 'occupied' ? 'active' : 'moved_out') as Tenant['status'],
          move_in_date: moveIn || null,
          children: childrenCount,
          children_names: childrenNames.trim() || null,
          emergency_contact_notes: ecNotes.trim() || null,
          notes: residentNotes.trim() || null,
        };

        if (tenant) {
          await updateTenant(tenant.id, residentPatch);
        } else if (memberDrafts.some((d) => d.name.trim()) || householdLabel.trim()) {
          await createTenant({ space_id: space.id, ...residentPatch });
        }

        await syncHouseholdMembers(space.id, memberDrafts, members);
        // Link members to their tenant record for archiving (requires migration 0026 — silently skipped if not yet run)
        const activeTenantId = tenant?.id;
        if (activeTenantId) {
          await updateMemberTenantLinks(space.id, activeTenantId).catch(() => { /* pre-migration */ });
        }
        await syncPets(space.id, petDrafts, pets);
        await loadRelated(space.id);
        onChanged();
        setMode('view');
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not save.';
        setError(msg.includes('schema cache')
          ? 'Database error — try refreshing the page. If this persists, ask Byron to reload the schema cache in the Supabase dashboard.'
          : msg);
      }
    });
  }

  // ── Save lot details ─────────────────────────────────────────────
  function saveLot() {
    if (!space) return;
    startLotTransition(async () => {
      try {
        await updateSpace(space.id, {
          status,
          current_rent: Number(rent) || 0,
          affordable_housing_discount: ahd,
          size: dimensions.trim() || null,
          street_number: streetNumber.trim() || null,
          street_name: streetName.trim() || null,
          notes: lotNotes.trim() || null,
        });
        onChanged();
        setMode('view');
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not save lot details.';
        setLotError(msg.includes('schema cache')
          ? 'Database error — try refreshing the page. If this persists, ask Byron to reload the schema cache in the Supabase dashboard.'
          : msg);
      }
    });
  }

  // ── Move out ─────────────────────────────────────────────────────
  function doMoveOut(reason: 'moved_out' | 'evicted') {
    if (!tenant || !space) return;
    startMoveOutTransition(async () => {
      try {
        await moveOutTenant(tenant.id, space.id, reason);
        onChanged();
        setShowMoveOut(false);
        setMode('view');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not update record.');
      }
    });
  }

  // ── Add notice ───────────────────────────────────────────────────
  function submitNotice() {
    if (!space || !profile || !noticeDate || !noticeDesc.trim()) return;
    startNoticeTransition(async () => {
      setNoticeError(null);
      try {
        await createNotice({
          space_id: space.id,
          tenant_id: tenant?.id ?? null,
          notice_type: noticeType,
          notice_date: noticeDate,
          description: noticeDesc.trim(),
          delivery_method: noticeDelivery,
          delivery_notes: noticeDeliveryNotes.trim() || null,
          created_by: profile.id,
        });
        setNoticeDesc('');
        setNoticeDeliveryNotes('');
        setShowNoticeForm(false);
        await loadRelated(space.id);
        onNoticeChange?.();
      } catch (e) {
        setNoticeError(e instanceof Error ? e.message : 'Could not save notice.');
      }
    });
  }

  const ownershipOptions = isLcp ? LCP_OWNERSHIPS : HOME_OWNERSHIPS;
  // Ensure selected ownership is valid when LCP is toggled on
  const effectiveOwnership = isLcp && ownership === 'resident_owned' ? 'sparrow_owned' : ownership;
  if (isLcp && ownership === 'resident_owned') setOwnership('sparrow_owned');

  const highestNotice = highestNoticeType(notices);

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-sparrow-ink/30 transition-opacity ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-xl transition-transform ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {space && (
          <>
            {/* ── Header ── */}
            <div className="flex items-center justify-between border-b border-sparrow-rule px-5 py-4">
              <div className="flex items-center gap-2">
                <h2 className="font-serif text-lg font-semibold">
                  {mode === 'lot-edit' ? 'Edit lot details — ' : ''}Lot {space.label}
                </h2>
                {highestNotice && (
                  <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${NOTICE_COLOR[highestNotice]}`}>
                    {highestNotice === 'E' ? 'EVICT' : `Notice ${highestNotice}`}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {canManage && mode === 'view' && (
                  <button onClick={() => setMode('edit')} className="btn-ghost text-sparrow-green">Edit</button>
                )}
                <button onClick={onClose} className="btn-ghost" aria-label="Close">✕</button>
              </div>
            </div>

            {/* ── View mode ── */}
            {mode === 'view' && (
              <>
                <ViewBody
                  space={space}
                  tenant={tenant}
                  members={members}
                  pets={pets}
                  notices={notices}
                  workOrders={workOrders}
                  canManage={canManage}
                  residentLabel={residentLabel}
                  isProgramHome={isProgramHome}
                  showNoticeForm={showNoticeForm}
                  noticeType={noticeType}
                  noticeDate={noticeDate}
                  noticeDesc={noticeDesc}
                  noticeDelivery={noticeDelivery}
                  noticeDeliveryNotes={noticeDeliveryNotes}
                  noticeError={noticeError}
                  noticePending={noticePending}
                  photoUploading={photoUploading}
                  photoError={photoError}
                  onPhotoUpload={handlePhotoUpload}
                  onPhotoInputClick={() => photoInputRef.current?.click()}
                  onSetNoticeType={setNoticeType}
                  onSetNoticeDate={setNoticeDate}
                  onSetNoticeDesc={setNoticeDesc}
                  onSetNoticeDelivery={setNoticeDelivery}
                  onSetNoticeDeliveryNotes={setNoticeDeliveryNotes}
                  onToggleNoticeForm={() => setShowNoticeForm((p) => !p)}
                  onSubmitNotice={submitNotice}
                  onDeleteNotice={async (id) => { await deleteNotice(id); await loadRelated(space.id); onNoticeChange?.(); }}
                  onNewWorkOrder={onNewWorkOrder}
                  onSelectWorkOrder={onSelectWorkOrder}
                  onEditLot={enterLotEdit}
                />
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void handlePhotoUpload(f); e.target.value = ''; }}
                />
              </>
            )}

            {/* ── Edit mode ── */}
            {mode === 'edit' && (
              <>
                <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4 text-sm">

                  {/* Designation */}
                  <div>
                    <SectionHead label="Special designation" />
                    <label className="mb-3 flex cursor-pointer items-center gap-3 rounded-lg border border-sparrow-rule p-3 hover:bg-sparrow-mist">
                      <input
                        type="checkbox"
                        checked={hasDesignation}
                        onChange={(e) => setHasDesignation(e.target.checked)}
                        className="h-4 w-4 rounded accent-sparrow-green"
                      />
                      <span className="text-sparrow-ink">This is a special-use home</span>
                    </label>

                    {hasDesignation && (
                      <div className="space-y-2 pl-2">
                        {DESIGNATIONS.map((d) => (
                          <label
                            key={d.value}
                            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${designation === d.value ? 'border-sparrow-green bg-sparrow-mist' : 'border-sparrow-rule hover:bg-sparrow-mist'}`}
                          >
                            <input
                              type="radio"
                              name="designation"
                              value={d.value}
                              checked={designation === d.value}
                              onChange={() => setDesignation(d.value)}
                              className="mt-0.5 accent-sparrow-green"
                            />
                            <div className="flex-1">
                              <p className="font-medium text-sparrow-ink">{d.label}</p>
                              <p className="text-xs text-sparrow-gray">{d.description}</p>
                              {(designation === d.value) && (d.value === 'lcp' || d.value === 'other') && (
                                <input
                                  className="field-input mt-2 text-xs"
                                  value={designationLabel}
                                  onChange={(e) => setDesignationLabel(e.target.value)}
                                  placeholder={d.value === 'lcp' ? 'House name (e.g. Goshen)' : 'Label shown on grid'}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Ownership */}
                  <div className="border-t border-sparrow-rule pt-4">
                    <SectionHead label="Ownership" />
                    {isLcp && (
                      <p className="mb-2 flex gap-1.5 rounded-lg bg-sparrow-mist px-3 py-2 text-xs text-sparrow-gray">
                        <span className="shrink-0">ⓘ</span>
                        <span>LCP homes are never resident-owned. Select Sparrow-owned (Sparrow holds the title) or Donated use (a church or individual made it available to Sparrow).</span>
                      </p>
                    )}
                    <div className="space-y-2">
                      {ownershipOptions.map((o) => (
                        <label
                          key={o.value}
                          className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${effectiveOwnership === o.value ? 'border-sparrow-green bg-sparrow-mist' : 'border-sparrow-rule hover:bg-sparrow-mist'}`}
                        >
                          <input type="radio" name="ownership" value={o.value} checked={effectiveOwnership === o.value} onChange={() => setOwnership(o.value)} className="mt-0.5 accent-sparrow-green" />
                          <div>
                            <p className="font-medium text-sparrow-ink">{o.label}</p>
                            <p className="text-xs text-sparrow-gray">{o.description}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Resident / Participant */}
                  <div className="border-t border-sparrow-rule pt-4">
                    <div className="mb-3 flex items-center justify-between">
                      <SectionHead label={residentLabel} />
                      {tenant && (
                        <button onClick={() => setShowMoveOut(true)} className="text-xs text-priority-p1 hover:underline">
                          Moved out
                        </button>
                      )}
                    </div>

                    <div className="mb-4 flex gap-2 rounded-lg bg-sparrow-mist px-3 py-2 text-xs text-sparrow-gray">
                      <span className="shrink-0">ⓘ</span>
                      <span>Operational reference only. Official lease records are held by Centurion. Dates entered here are working references, not legal records.</span>
                    </div>

                    <div className="space-y-4">
                      <Field label="Household label" tip="Optional — e.g. 'Smith Family'. Individual adults listed below.">
                        <input className="field-input" value={householdLabel} onChange={(e) => setHouseholdLabel(e.target.value)} placeholder="e.g. Smith Family (optional)" />
                      </Field>

                      {/* Adults */}
                      <div>
                        <p className="field-label mb-2">Adults <Info tip="Add each adult separately. Phone and email are optional." /></p>
                        <div className="space-y-2">
                          {memberDrafts.map((m, i) => (
                            <div key={i} className="space-y-2 rounded-lg border border-sparrow-rule p-3">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold text-sparrow-gray">Adult {i + 1}</p>
                                {m.id ? (
                                  <button type="button" onClick={() => void archiveMemberById(m.id!, m.name)} className="text-xs text-sparrow-gray hover:text-priority-p1 hover:underline">Member moved out</button>
                                ) : (
                                  <button type="button" onClick={() => removeMember(i)} className="text-xs text-priority-p1 hover:underline">Remove</button>
                                )}
                              </div>
                              <input className="field-input" value={m.name} onChange={(e) => updateMember(i, { name: e.target.value })} placeholder="Full name" />
                              <div className="grid grid-cols-2 gap-2">
                                <input className="field-input" value={m.phone} onChange={(e) => updateMember(i, { phone: e.target.value })} placeholder="Phone (optional)" />
                                <input className="field-input" type="email" value={m.email} onChange={(e) => updateMember(i, { email: e.target.value })} placeholder="Email (optional)" />
                              </div>
                              <label className="flex cursor-pointer items-center gap-2">
                                <input type="checkbox" checked={m.park_chat_opt_in} onChange={(e) => updateMember(i, { park_chat_opt_in: e.target.checked })} className="h-4 w-4 rounded accent-sparrow-green" />
                                <span className="text-xs text-sparrow-gray">Opted into park alerts <Info tip="This person has agreed to receive emergency SMS alerts. They can opt out at any time." /></span>
                              </label>
                            </div>
                          ))}
                          <button type="button" onClick={addMember} className="text-xs font-medium text-sparrow-green hover:underline">+ Add adult</button>
                        </div>
                      </div>

                      {/* Children */}
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Number of children" tip="Children under 18.">
                          <input className="field-input" type="number" min="0" value={children} onChange={(e) => setChildren(e.target.value)} />
                        </Field>
                        <Field label="Children's names" tip="First names only. e.g. Emma, Jake">
                          <input className="field-input" value={childrenNames} onChange={(e) => setChildrenNames(e.target.value)} placeholder="e.g. Emma, Jake" />
                        </Field>
                      </div>

                      {/* Pets */}
                      <div>
                        <p className="field-label mb-2">Pets <Info tip="Record pets for lease compliance and park management. Type, name (optional), and any notes (breed, registration, etc.)" /></p>
                        <div className="space-y-2">
                          {petDrafts.map((p, i) => (
                            <div key={i} className="space-y-2 rounded-lg border border-sparrow-rule p-3">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold text-sparrow-gray">Pet {i + 1}</p>
                                <button type="button" onClick={() => removePet(i)} className="text-xs text-priority-p1 hover:underline">Remove</button>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <select className="field-input" value={p.pet_type} onChange={(e) => updatePet(i, { pet_type: e.target.value as PetType })}>
                                  {PET_TYPES.map((pt) => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
                                </select>
                                <input className="field-input" value={p.name} onChange={(e) => updatePet(i, { name: e.target.value })} placeholder="Name (optional)" />
                              </div>
                              <input className="field-input" value={p.notes} onChange={(e) => updatePet(i, { notes: e.target.value })} placeholder="Breed, notes, registration status…" />
                            </div>
                          ))}
                          <button type="button" onClick={addPet} className="text-xs font-medium text-sparrow-green hover:underline">+ Add pet</button>
                        </div>
                      </div>

                      {/* Emergency contact */}
                      <Field label="Emergency contact notes" tip="Who to call if staff can't reach residents. Include name, relationship, and phone.">
                        <textarea className="field-input" rows={3} value={ecNotes} onChange={(e) => setEcNotes(e.target.value)} placeholder="e.g. Janet Smith (sister) 555-0192" />
                      </Field>

                      {/* Move-in date */}
                      <Field label="Move-in date (as reported)" tip="Working reference only — not the official lease date. Official date is in Centurion's records.">
                        <input className="field-input" type="date" value={moveIn} onChange={(e) => setMoveIn(e.target.value)} />
                      </Field>

                      {/* Resident notes */}
                      <Field label="Resident notes">
                        <textarea className="field-input" rows={2} value={residentNotes} onChange={(e) => setResidentNotes(e.target.value)} placeholder="Visible to TOC staff and admins only" />
                      </Field>
                    </div>
                  </div>

                  {/* Home details */}
                  {ownership !== 'sparrow_owned' && (
                    <div className="border-t border-sparrow-rule pt-4">
                      <SectionHead label="Home details" />
                      <div className="space-y-3">
                        <Field label="Home type">
                          <PillGroup options={SPACE_TYPES} value={type} onChange={setType} />
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                          <Field label="VIN" tip="Vehicle Identification Number — on the data plate inside the home or door frame.">
                            <input className="field-input" value={vin} onChange={(e) => setVin(e.target.value)} placeholder="VIN" />
                          </Field>
                          {type === 'manufactured_home' && (
                            <Field label="HUD label #" tip="Federal certification label on the exterior of the home — confirms it met HUD safety standards.">
                              <input className="field-input" value={hudLabel} onChange={(e) => setHudLabel(e.target.value)} placeholder="HUD label #" />
                            </Field>
                          )}
                        </div>
                        {ownership === 'resident_owned' && (
                          <Field label="Home title" tip="Who holds legal title to the home structure (not the land). Resident-held: tenant owns it. Lienheld: a bank holds a lien.">
                            <PillGroup options={TITLE_HOLDERS} value={titleHolder as TitleHolder} onChange={setTitleHolder} />
                          </Field>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Lot details — greyed, locked in edit mode */}
                  <div className="rounded-xl border border-dashed border-sparrow-rule bg-sparrow-mist/50 p-4 opacity-60">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-sparrow-gray">Lot details</p>
                      {canManage && (
                        <button onClick={enterLotEdit} className="text-xs font-medium text-sparrow-green opacity-100" style={{ opacity: 1 }}>
                          Edit lot details
                        </button>
                      )}
                    </div>
                    <div className="space-y-0.5 text-xs text-sparrow-gray">
                      <p>Lot {space.label} · {status}</p>
                      {(space.street_number || space.street_name) && (
                        <p>{[space.street_number, space.street_name].filter(Boolean).join(' ')}</p>
                      )}
                      {space.size && <p>Dimensions: {space.size}</p>}
                      {space.current_rent > 0 && <p>Rent: ${space.current_rent}/mo</p>}
                    </div>
                  </div>

                  {error && <p className="text-sm text-priority-p1">{error}</p>}
                </div>

                <div className="flex items-center justify-between border-t border-sparrow-rule px-5 py-4">
                  <button
                    onClick={() => { if (window.confirm('Clear all resident and home info from the form? The lot will stay as-is until you Save.')) clearForm(); }}
                    className="text-xs text-sparrow-gray hover:text-priority-p1 hover:underline"
                  >
                    Clear all
                  </button>
                  <div className="flex gap-2">
                    <button onClick={() => { populateAll(); setMode('view'); }} className="btn-ghost">Cancel</button>
                    <button onClick={save} disabled={pending} className="btn-primary">{pending ? 'Saving…' : 'Save'}</button>
                  </div>
                </div>
              </>
            )}

            {/* ── Lot edit mode ── */}
            {mode === 'lot-edit' && (
              <>
                <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
                  <p className="text-xs text-sparrow-gray">Lot details change rarely. Edit carefully.</p>
                  <Field label="Availability" tip={isProgramHome ? 'Filled: participant placed here. Vacant: empty.' : 'Occupied: active lease. Reserved: placement in progress. Vacant: available.'}>
                    <PillGroup options={availabilityOptions(effectiveOwnership)} value={status} onChange={setStatus} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Monthly rent">
                      <input className="field-input" type="number" min="0" value={rent} onChange={(e) => setRent(e.target.value)} />
                    </Field>
                    <Field label="Affordable housing discount" tip="Reduced rate under the affordable housing program.">
                      <label className="mt-2 flex cursor-pointer items-center gap-2">
                        <input type="checkbox" checked={ahd} onChange={(e) => setAhd(e.target.checked)} className="h-4 w-4 rounded accent-sparrow-green" />
                        <span>Yes</span>
                      </label>
                    </Field>
                  </div>
                  <Field label="Lot dimensions" tip="Physical size, e.g. 40×80 ft.">
                    <input className="field-input" value={dimensions} onChange={(e) => setDimensions(e.target.value)} placeholder="e.g. 40×80 ft" />
                  </Field>
                  <div>
                    <p className="field-label">Street address</p>
                    <div className="mt-1 grid grid-cols-[5rem_1fr] gap-2">
                      <input className="field-input" value={streetNumber} onChange={(e) => setStreetNumber(e.target.value)} placeholder="241" />
                      <select className="field-input" value={streetName} onChange={(e) => setStreetName(e.target.value)}>
                        <option value="">— Select street —</option>
                        <option value="SW Mobile Place">SW Mobile Place</option>
                        <option value="SW Twin Oaks Circle">SW Twin Oaks Circle</option>
                        <option value="SW Pleasant Place">SW Pleasant Place</option>
                      </select>
                    </div>
                  </div>
                  <Field label="Lot notes">
                    <textarea className="field-input" rows={3} value={lotNotes} onChange={(e) => setLotNotes(e.target.value)} placeholder="Anything staff should know about this space" />
                  </Field>
                  {lotError && <p className="text-sm text-priority-p1">{lotError}</p>}
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-sparrow-rule px-5 py-4">
                  <button onClick={cancelLotEdit} className="btn-ghost">Cancel</button>
                  <button onClick={saveLot} disabled={lotPending} className="btn-primary">{lotPending ? 'Saving…' : 'Save lot details'}</button>
                </div>
              </>
            )}

            {/* ── Move out confirmation ── */}
            {showMoveOut && tenant && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/95 px-8 text-center">
                <h3 className="mb-2 font-serif text-lg font-semibold">How did they leave?</h3>
                <p className="mb-6 text-sm text-sparrow-gray">
                  The household record and all members will be archived. The lot will show as vacant. This cannot be undone.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <button onClick={() => doMoveOut('moved_out')} disabled={moveOutPending} className="btn-primary">Moved out</button>
                  <button onClick={() => doMoveOut('evicted')} disabled={moveOutPending} className="rounded-xl border border-priority-p1 px-4 py-2 text-sm font-semibold text-priority-p1 hover:bg-priority-p1 hover:text-white">Evicted</button>
                  <button onClick={() => setShowMoveOut(false)} disabled={moveOutPending} className="btn-ghost">Cancel</button>
                </div>
              </div>
            )}
          </>
        )}
      </aside>
    </>
  );
}

// ── View body ─────────────────────────────────────────────────────────
function ViewBody({
  space, tenant, members, pets, notices, workOrders, canManage,
  residentLabel, isProgramHome,
  showNoticeForm, noticeType, noticeDate, noticeDesc, noticeDelivery,
  noticeDeliveryNotes, noticeError, noticePending,
  photoUploading, photoError, onPhotoUpload: _onPhotoUpload, onPhotoInputClick,
  onSetNoticeType, onSetNoticeDate, onSetNoticeDesc, onSetNoticeDelivery,
  onSetNoticeDeliveryNotes, onToggleNoticeForm, onSubmitNotice, onDeleteNotice,
  onNewWorkOrder, onSelectWorkOrder, onEditLot,
}: {
  space: Space; tenant: Tenant | null; members: HouseholdMember[]; pets: Pet[];
  notices: LotNoticeWithCreator[]; workOrders: WorkOrderWithAssignee[];
  canManage: boolean; residentLabel: string; isProgramHome: boolean;
  showNoticeForm: boolean; noticeType: NoticeType; noticeDate: string;
  noticeDesc: string; noticeDelivery: NoticeDelivery; noticeDeliveryNotes: string;
  noticeError: string | null; noticePending: boolean;
  photoUploading: boolean; photoError: string | null;
  onPhotoUpload: (file: File) => void; onPhotoInputClick: () => void;
  onSetNoticeType: (v: NoticeType) => void; onSetNoticeDate: (v: string) => void;
  onSetNoticeDesc: (v: string) => void; onSetNoticeDelivery: (v: NoticeDelivery) => void;
  onSetNoticeDeliveryNotes: (v: string) => void; onToggleNoticeForm: () => void;
  onSubmitNotice: () => void; onDeleteNotice: (id: string) => void;
  onNewWorkOrder: (spaceId: string) => void; onSelectWorkOrder: (wo: WorkOrderWithAssignee) => void;
  onEditLot: () => void;
}) {
  const ownershipLabel =
    space.ownership === 'sparrow_owned' ? 'Sparrow-owned'
    : space.ownership === 'donated_use' ? 'Donated use'
    : space.ownership === 'resident_owned' ? 'Resident-owned'
    : null;

  const statusLabel = (space.status === 'occupied' && isProgramHome) ? 'Filled' : space.status;

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4 text-sm">
      {/* Lot photo */}
      {space.photo_url ? (
        <div className="relative mb-4">
          <img src={space.photo_url} alt={`Lot ${space.label}`} className="h-48 w-full rounded-lg object-cover" />
          {canManage && (
            <button
              onClick={onPhotoInputClick}
              disabled={photoUploading}
              className="absolute bottom-2 right-2 rounded-md bg-white/80 px-2 py-1 text-xs font-medium text-sparrow-ink hover:bg-white disabled:opacity-50"
            >
              {photoUploading ? 'Uploading…' : 'Replace photo'}
            </button>
          )}
        </div>
      ) : canManage ? (
        <button
          onClick={onPhotoInputClick}
          disabled={photoUploading}
          className="mb-4 flex w-full items-center justify-center rounded-lg border-2 border-dashed border-sparrow-rule py-5 text-sm text-sparrow-gray hover:border-sparrow-green hover:text-sparrow-green disabled:opacity-50"
        >
          {photoUploading ? 'Uploading…' : '+ Add lot photo'}
        </button>
      ) : null}
      {photoError && <p className="mb-3 text-xs text-priority-p1">{photoError}</p>}

      {/* Chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        <span className="rounded-full bg-sparrow-mist px-2 py-0.5 text-xs capitalize text-sparrow-gray">{statusLabel}</span>
        {ownershipLabel && <span className="rounded-full bg-sparrow-mist px-2 py-0.5 text-xs font-medium text-sparrow-ink">{ownershipLabel}</span>}
        {space.designation_type === 'lcp' && (
          <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">LCP{space.designation_label ? ` · ${space.designation_label}` : ''}</span>
        )}
        {space.designation_type === 'sv' && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Service Volunteer</span>}
        {space.designation_type === 'pm' && <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-700">Property Manager</span>}
        {space.designation_type === 'other' && space.designation_label && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{space.designation_label}</span>}
        {space.affordable_housing_discount && <span className="rounded-full bg-sparrow-sage px-2 py-0.5 text-xs font-medium text-sparrow-green">AH discount</span>}
      </div>

      {/* Resident */}
      <div className="mb-5 space-y-3">
        <p className="field-label">{residentLabel}</p>
        <p className="flex gap-1.5 rounded-lg bg-sparrow-mist px-3 py-2 text-xs text-sparrow-gray">
          <span className="shrink-0">ⓘ</span>
          <span>Operational reference only. Official records held by Centurion.</span>
        </p>
        {tenant?.name && <p className="font-medium text-sparrow-ink">{tenant.name}</p>}
        {members.length > 0 ? (
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.id} className="rounded-lg border border-sparrow-rule p-2.5">
                <p className="font-medium text-sparrow-ink">{m.name}</p>
                <p className="text-xs text-sparrow-gray">
                  {[m.phone, m.email].filter(Boolean).join(' · ')}
                  {m.park_chat_opt_in && <span className="ml-1 text-sparrow-green">· ✓ park alerts</span>}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sparrow-gray">{space.status === 'vacant' ? 'Vacant.' : 'No adults on file.'}</p>
        )}
        {tenant && (
          <div className="space-y-1 text-sparrow-gray">
            {(tenant.children ?? 0) > 0 && (
              <p>{tenant.children} child{(tenant.children ?? 0) !== 1 ? 'ren' : ''}{tenant.children_names ? `: ${tenant.children_names}` : ''}</p>
            )}
            {pets.length > 0 && (
              <p>{pets.map((p) => `${p.pet_type}${p.name ? ` (${p.name})` : ''}`).join(', ')}</p>
            )}
            {tenant.move_in_date && <p>Move-in (as reported): {tenant.move_in_date}</p>}
            {tenant.emergency_contact_notes && (
              <div className="rounded bg-sparrow-cream px-2 py-1.5 text-xs">
                <span className="font-medium text-sparrow-ink">Emergency: </span>{tenant.emergency_contact_notes}
              </div>
            )}
            {tenant.notes && <div className="rounded bg-sparrow-cream px-2 py-1.5 text-xs text-sparrow-ink">{tenant.notes}</div>}
          </div>
        )}
      </div>

      {/* Home details */}
      {space.ownership !== 'sparrow_owned' && (space.vin || space.hud_label || space.title_holder) && (
        <div className="mb-5">
          <p className="field-label mb-1">Home details</p>
          <div className="space-y-0.5 text-sparrow-gray">
            <p>{space.type === 'rv' ? 'RV' : 'Manufactured home'}</p>
            {space.vin && <p>VIN: {space.vin}</p>}
            {space.hud_label && <p>HUD label: {space.hud_label}</p>}
            {space.title_holder && <p>Title: {space.title_holder === 'resident_held' ? 'Resident-held' : 'Lienheld'}</p>}
          </div>
        </div>
      )}

      {/* Lot details — greyed */}
      <div className="mb-5 rounded-xl border border-dashed border-sparrow-rule bg-sparrow-mist/50 p-4 opacity-60">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-sparrow-gray">Lot details</p>
          {canManage && (
            <button onClick={onEditLot} className="text-xs font-medium text-sparrow-green opacity-100" style={{ opacity: 1 }}>
              Edit lot details
            </button>
          )}
        </div>
        <div className="space-y-0.5 text-xs text-sparrow-gray">
          <p>Lot {space.label} · {statusLabel}</p>
          {(space.street_number || space.street_name) && (
            <p>{[space.street_number, space.street_name].filter(Boolean).join(' ')}</p>
          )}
          {space.size && <p>Dimensions: {space.size}</p>}
          {space.current_rent > 0 && <p>Rent: ${space.current_rent}/mo</p>}
          {space.notes && <p>{space.notes}</p>}
        </div>
      </div>

      {/* Notices */}
      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="field-label">Notices</p>
          {canManage && (
            <button onClick={onToggleNoticeForm} className="text-xs font-medium text-sparrow-green hover:underline">
              {showNoticeForm ? 'Cancel' : '+ Add notice'}
            </button>
          )}
        </div>

        {showNoticeForm && (
          <div className="mb-3 space-y-3 rounded-xl border border-sparrow-rule p-4">
            <div>
              <p className="field-label mb-1">Notice type</p>
              <div className="flex flex-wrap gap-2">
                {NOTICE_TYPES.map((n) => (
                  <button key={n.value} type="button" onClick={() => onSetNoticeType(n.value)}
                    className={`rounded-full border px-3 py-0.5 text-xs font-medium ${noticeType === n.value ? 'border-priority-p1 bg-priority-p1 text-white' : 'border-sparrow-rule text-sparrow-gray hover:border-priority-p1 hover:text-priority-p1'}`}>
                    {n.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="field-label mb-1">Date given</p>
              <input type="date" className="field-input" value={noticeDate} onChange={(e) => onSetNoticeDate(e.target.value)} />
            </div>
            <div>
              <p className="field-label mb-1">What was the notice for?</p>
              <textarea className="field-input" rows={2} value={noticeDesc} onChange={(e) => onSetNoticeDesc(e.target.value)} placeholder="Describe the violation or reason" />
            </div>
            <div>
              <p className="field-label mb-1">How was it delivered?</p>
              <select className="field-input" value={noticeDelivery} onChange={(e) => onSetNoticeDelivery(e.target.value as NoticeDelivery)}>
                {NOTICE_DELIVERIES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <input className="field-input" value={noticeDeliveryNotes} onChange={(e) => onSetNoticeDeliveryNotes(e.target.value)} placeholder="Delivery notes (optional)" />
            {noticeError && <p className="text-xs text-priority-p1">{noticeError}</p>}
            <button onClick={onSubmitNotice} disabled={noticePending} className="btn-primary w-full">
              {noticePending ? 'Saving…' : 'Save notice'}
            </button>
          </div>
        )}

        {notices.length === 0 ? (
          <p className="text-sparrow-gray">None on record.</p>
        ) : (
          <ul className="divide-y divide-sparrow-rule rounded-xl border border-sparrow-rule">
            {notices.map((n) => (
              <li key={n.id} className="px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className={`mr-2 rounded px-1.5 py-0.5 text-xs font-bold ${NOTICE_COLOR[n.notice_type]}`}>
                      {n.notice_type === 'E' ? 'Eviction' : `Notice ${n.notice_type}`}
                    </span>
                    <span className="text-xs text-sparrow-gray">{n.notice_date}</span>
                    <p className="mt-1 text-xs text-sparrow-ink">{n.description}</p>
                    <p className="text-xs text-sparrow-gray capitalize">{n.delivery_method.replace(/_/g, ' ')}{n.delivery_notes ? ` — ${n.delivery_notes}` : ''}</p>
                  </div>
                  {canManage && (
                    <button onClick={() => onDeleteNotice(n.id)} className="shrink-0 text-xs text-sparrow-gray hover:text-priority-p1">✕</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Work orders */}
      <div className="mb-5">
        <div className="flex items-center justify-between">
          <p className="field-label">Work orders</p>
          {canManage && <button onClick={() => onNewWorkOrder(space.id)} className="text-xs font-medium text-sparrow-green hover:underline">+ New</button>}
        </div>
        {workOrders.length === 0 ? (
          <p className="mt-1 text-sparrow-gray">None.</p>
        ) : (
          <ul className="mt-1 divide-y divide-sparrow-rule rounded-lg border border-sparrow-rule">
            {workOrders.map((w) => (
              <li key={w.id}>
                <button onClick={() => onSelectWorkOrder(w)} className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-sparrow-mist">
                  <span className="text-sparrow-ink">{w.description}</span>
                  <span className="ml-2 shrink-0 text-xs capitalize text-sparrow-gray">{w.status.replace('_', ' ')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
