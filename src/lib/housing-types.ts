export type SpaceStatus = 'occupied' | 'vacant' | 'reserved' | 'maintenance';
export type SpaceType = 'manufactured_home' | 'rv';
export type RentStatus = 'current' | 'overdue' | 'na';
export type TenantStatus = 'active' | 'applicant' | 'moved_out' | 'evicted';
export type WoCategory = 'tenant_request' | 'common_area' | 'infrastructure' | 'hazard_tree' | 'safety';
export type WoPriority = 'low' | 'medium' | 'high' | 'urgent';
export type WoStatus = 'open' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';

export interface Space {
  id: string;
  label: string;
  status: SpaceStatus;
  type: SpaceType;
  current_rent: number;
  rent_status: RentStatus;
  size: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Tenant {
  id: string;
  space_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  household_size: number;
  annual_income: number | null;
  status: TenantStatus;
  move_in_date: string | null;
  notes: string | null;
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
  completed_date: string | null;
  created_at: string;
  updated_at: string;
}

export const SPACE_STATUSES: { value: SpaceStatus; label: string }[] = [
  { value: 'occupied', label: 'Occupied' },
  { value: 'vacant', label: 'Vacant' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'maintenance', label: 'Under maintenance' },
];

export const SPACE_TYPES: { value: SpaceType; label: string }[] = [
  { value: 'manufactured_home', label: 'Manufactured home' },
  { value: 'rv', label: 'RV' },
];

export const RENT_STATUSES: { value: RentStatus; label: string }[] = [
  { value: 'current', label: 'Current' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'na', label: 'N/A' },
];

export const TENANT_STATUSES: { value: TenantStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'applicant', label: 'Applicant' },
  { value: 'moved_out', label: 'Moved out' },
  { value: 'evicted', label: 'Evicted' },
];

export const WO_CATEGORIES: { value: WoCategory; label: string }[] = [
  { value: 'tenant_request', label: 'Tenant request' },
  { value: 'common_area', label: 'Common area' },
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'hazard_tree', label: 'Hazard tree' },
  { value: 'safety', label: 'Safety' },
];

export const WO_PRIORITIES: { value: WoPriority; label: string; dot: string }[] = [
  { value: 'urgent', label: 'Urgent', dot: 'bg-priority-p1' },
  { value: 'high', label: 'High', dot: 'bg-priority-p2' },
  { value: 'medium', label: 'Medium', dot: 'bg-priority-p3' },
  { value: 'low', label: 'Low', dot: 'bg-priority-p4' },
];

export const WO_STATUSES: { value: WoStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const OPEN_WO_STATUSES: WoStatus[] = ['open', 'assigned', 'in_progress'];

/** Lot color per the brief: red = overdue rent, amber = open work order, green = occupied & current, gray = vacant. */
export type LotColor = 'red' | 'amber' | 'green' | 'gray';

export function lotColor(space: Space, hasOpenWorkOrder: boolean): LotColor {
  if (space.status === 'vacant') return 'gray';
  if (space.rent_status === 'overdue') return 'red';
  if (hasOpenWorkOrder) return 'amber';
  return 'green';
}

export const LOT_COLOR_CLASSES: Record<LotColor, string> = {
  green: 'bg-sparrow-sage border-sparrow-green/40 text-sparrow-green',
  amber: 'bg-amber-100 border-amber-400 text-amber-800',
  red: 'bg-red-100 border-red-400 text-red-700',
  gray: 'border-dashed border-sparrow-rule bg-white text-sparrow-gray',
};

/**
 * Where a work order is, lot-first for at-a-glance wayfinding:
 *  - lot-tied → "Lot 14" or "Lot 14: front porch" (if a spot detail is given)
 *  - common area / infra → the location text
 * Dedupes legacy data where `location` just restated the lot ("Lot 14").
 */
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

export const LOT_LEGEND: { color: LotColor; label: string }[] = [
  { color: 'green', label: 'Occupied · current' },
  { color: 'amber', label: 'Open work order' },
  { color: 'red', label: 'Rent overdue' },
  { color: 'gray', label: 'Vacant' },
];
