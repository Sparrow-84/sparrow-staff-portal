export type SpaceStatus     = 'occupied' | 'vacant' | 'reserved' | 'maintenance';
export type SpaceType       = 'manufactured_home' | 'rv';
export type HomeOwnership   = 'resident_owned' | 'sparrow_owned' | 'donated_use';
export type TitleHolder     = 'resident_held' | 'lienheld';
export type RentStatus      = 'current' | 'overdue' | 'na';   // kept in DB; not shown in UI
export type TenantStatus    = 'active' | 'applicant' | 'moved_out' | 'evicted';
export type WoCategory      = 'tenant_request' | 'common_area' | 'infrastructure' | 'hazard_tree' | 'safety';
export type WoPriority      = 'low' | 'medium' | 'high' | 'urgent';
export type WoStatus        = 'open' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
export type HomeDesignation = 'lcp' | 'sv' | 'pm' | 'other';
export type PetType         = 'dog' | 'cat' | 'bird' | 'other';
export type NoticeType      = '1' | '2' | '3' | 'E';
export type NoticeDelivery  = 'in_person' | 'left_on_door' | 'mailed' | 'posted' | 'other';

export interface Space {
  id: string;
  label: string;
  status: SpaceStatus;
  type: SpaceType;
  ownership: HomeOwnership | null;
  designation_type: HomeDesignation | null;
  designation_label: string | null;        // house name (LCP) or custom label (other)
  affordable_housing_discount: boolean;
  vin: string | null;
  hud_label: string | null;
  title_holder: TitleHolder | null;
  current_rent: number;
  rent_status: RentStatus;                 // in DB; not shown in UI
  size: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Tenant {
  id: string;
  space_id: string | null;
  name: string;                            // household label (e.g. "Smith Family") — optional
  household_size: number;                  // in DB; derived going forward
  annual_income: number | null;            // in DB; not shown in UI
  status: TenantStatus;
  move_in_date: string | null;
  children: number;
  children_names: string | null;
  emergency_contact_notes: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface HouseholdMember {
  id: string;
  space_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  park_chat_opt_in: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Pet {
  id: string;
  space_id: string;
  pet_type: PetType;
  name: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface LotNotice {
  id: string;
  space_id: string;
  tenant_id: string | null;
  notice_type: NoticeType;
  notice_date: string;
  description: string;
  delivery_method: NoticeDelivery;
  delivery_notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface WorkOrder {
  id: string;
  space_id: string | null;
  location: string;
  category: WoCategory;
  description: string;
  priority: WoPriority;
  status: WoStatus;
  assigned_to: string | null;
  request_date: string;
  created_at: string;
  updated_at: string;
}

// ── Display constants ─────────────────────────────────────────────────

export const HOME_OWNERSHIPS: { value: HomeOwnership; label: string; description: string }[] = [
  {
    value: 'resident_owned',
    label: 'Resident-owned',
    description: 'The person living here owns this home.',
  },
  {
    value: 'sparrow_owned',
    label: 'Sparrow-owned',
    description: 'Sparrow holds the title to this home.',
  },
  {
    value: 'donated_use',
    label: 'Donated use',
    description: 'A church or individual owns the home and has made it available to Sparrow.',
  },
];

export const SPACE_TYPES: { value: SpaceType; label: string }[] = [
  { value: 'manufactured_home', label: 'Manufactured home' },
  { value: 'rv', label: 'RV' },
];

export const TITLE_HOLDERS: { value: TitleHolder; label: string }[] = [
  { value: 'resident_held', label: 'Resident-held' },
  { value: 'lienheld',      label: 'Lienheld (bank / lender)' },
];

export const PET_TYPES: { value: PetType; label: string }[] = [
  { value: 'dog',   label: 'Dog' },
  { value: 'cat',   label: 'Cat' },
  { value: 'bird',  label: 'Bird' },
  { value: 'other', label: 'Other' },
];

export const NOTICE_TYPES: { value: NoticeType; label: string; description: string }[] = [
  { value: '1', label: 'Notice 1', description: 'First written warning.' },
  { value: '2', label: 'Notice 2', description: 'Second written warning — pattern of violation.' },
  { value: '3', label: 'Notice 3', description: 'Third warning — final before eviction notice.' },
  { value: 'E', label: 'Eviction notice', description: 'Formal eviction / termination of tenancy notice.' },
];

export const NOTICE_DELIVERIES: { value: NoticeDelivery; label: string }[] = [
  { value: 'in_person',    label: 'Handed to resident in person' },
  { value: 'left_on_door', label: 'Left on door' },
  { value: 'mailed',       label: 'Mailed' },
  { value: 'posted',       label: 'Posted on property' },
  { value: 'other',        label: 'Other' },
];

export const WO_CATEGORIES: { value: WoCategory; label: string }[] = [
  { value: 'tenant_request', label: 'Tenant request' },
  { value: 'common_area',    label: 'Common area' },
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'hazard_tree',    label: 'Hazard tree' },
  { value: 'safety',         label: 'Safety' },
];

export const WO_PRIORITIES: { value: WoPriority; label: string; dot: string }[] = [
  { value: 'urgent', label: 'Urgent', dot: 'bg-priority-p1' },
  { value: 'high',   label: 'High',   dot: 'bg-priority-p2' },
  { value: 'medium', label: 'Medium', dot: 'bg-priority-p3' },
  { value: 'low',    label: 'Low',    dot: 'bg-priority-p4' },
];

export const WO_STATUSES: { value: WoStatus; label: string }[] = [
  { value: 'open',        label: 'Open' },
  { value: 'assigned',    label: 'Assigned' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed',   label: 'Completed' },
  { value: 'cancelled',   label: 'Cancelled' },
];

export const OPEN_WO_STATUSES: WoStatus[] = ['open', 'assigned', 'in_progress'];

// ── Availability options vary by ownership ────────────────────────────

export const PROGRAM_HOME_STATUSES: { value: SpaceStatus; label: string }[] = [
  { value: 'occupied', label: 'Filled' },
  { value: 'vacant',   label: 'Vacant' },
];

export const RESIDENT_HOME_STATUSES: { value: SpaceStatus; label: string }[] = [
  { value: 'occupied', label: 'Occupied' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'vacant',   label: 'Vacant' },
];

export function availabilityOptions(ownership: HomeOwnership | null) {
  return ownership === 'resident_owned' ? RESIDENT_HOME_STATUSES : PROGRAM_HOME_STATUSES;
}

// ── Designation helpers ───────────────────────────────────────────────

/** Short label shown on the grid square for a designated home. */
export function designationGridLabel(space: Pick<Space, 'designation_type' | 'designation_label'>): string | null {
  switch (space.designation_type) {
    case 'lcp':   return space.designation_label || 'LCP';
    case 'sv':    return 'SV';
    case 'pm':    return 'PM';
    case 'other': return space.designation_label || null;
    default:      return null;
  }
}

/** Tailwind text color class for a designation's grid label. */
export function designationTextClass(
  designation: HomeDesignation | null,
  filled: boolean,
): string {
  switch (designation) {
    case 'lcp':   return filled ? 'text-purple-200' : 'text-purple-600';
    case 'sv':    return filled ? 'text-amber-200'  : 'text-amber-600';
    case 'pm':    return filled ? 'text-teal-200'   : 'text-teal-600';
    case 'other': return filled ? 'text-white/60'   : 'text-slate-500';
    default:      return '';
  }
}

// ── Lot grid color system ─────────────────────────────────────────────

export function lotClasses(space: Space): string {
  const filled = space.status !== 'vacant';
  if (!space.ownership) {
    return 'border-dashed border-gray-300 bg-white text-gray-400';
  }
  if (space.ownership === 'sparrow_owned') {
    return filled
      ? 'border-sparrow-green bg-sparrow-green text-white'
      : 'border-sparrow-green bg-white text-sparrow-green';
  }
  return filled
    ? 'border-blue-700 bg-blue-700 text-white'
    : 'border-blue-700 bg-white text-blue-700';
}

export const LOT_LEGEND: { key: string; classes: string; label: string }[] = [
  { key: 'sp-occ',  classes: 'bg-sparrow-green border-sparrow-green', label: 'Sparrow-owned · filled' },
  { key: 'sp-vac',  classes: 'bg-white border-sparrow-green',         label: 'Sparrow-owned · vacant' },
  { key: 'res-occ', classes: 'bg-blue-700 border-blue-700',           label: 'Resident / donated · occupied' },
  { key: 'res-vac', classes: 'bg-white border-blue-700',              label: 'Resident / donated · vacant' },
  { key: 'unk',     classes: 'bg-white border-dashed border-gray-300', label: 'Ownership unknown' },
];

// ── Work order helpers ────────────────────────────────────────────────

export function workOrderWhere(
  wo: { space_id: string | null; location: string },
  lotLabelById: Map<string, string>,
): string {
  const lot = wo.space_id ? lotLabelById.get(wo.space_id) : undefined;
  if (!lot) return wo.location.trim() || 'Common area';
  const detail = wo.location.trim();
  const normalized = detail.toLowerCase().replace(/\s+/g, '');
  if (!detail || normalized === `lot${lot}`.toLowerCase() || normalized === lot.toLowerCase()) {
    return `Lot ${lot}`;
  }
  return `Lot ${lot}: ${detail}`;
}

// ── Resident sort helpers ─────────────────────────────────────────────

/** Returns the last name to sort by for a household. */
export function householdSortKey(
  tenant: Tenant | null,
  firstMember: HouseholdMember | null,
): string {
  const raw = tenant?.name?.trim() || firstMember?.name?.trim() || '';
  if (!raw) return 'zzz';
  const parts = raw.trim().split(/\s+/);
  return (parts[parts.length - 1] ?? raw).toLowerCase();
}
