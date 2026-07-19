// ── Enums & constants ─────────────────────────────────────────────────────

export type InvBentonSchedule = 'schedule_2' | 'schedule_4' | 'schedule_5a' | 'schedule_5b';
export type InvFilingStatus   = 'not_filed' | 'added' | 'updated' | 'carried_over';

export const BENTON_SCHEDULE_LABELS: Record<InvBentonSchedule, string> = {
  schedule_2:  'Schedule 2 — Noninventory Supplies',
  schedule_4:  'Schedule 4 — Professional Library',
  schedule_5a: 'Schedule 5A — Other Taxable Personal Property',
  schedule_5b: 'Schedule 5B — Small Hand Tools',
};

export const BENTON_SCHEDULE_SHORT: Record<InvBentonSchedule, string> = {
  schedule_2:  'Sched 2',
  schedule_4:  'Sched 4',
  schedule_5a: 'Sched 5A',
  schedule_5b: 'Sched 5B',
};

export const FILING_STATUS_META: Record<InvFilingStatus, { label: string; chip: string }> = {
  added:        { label: 'New',       chip: 'bg-sparrow-green/10 text-sparrow-green' },
  updated:      { label: 'Updated',   chip: 'bg-sparrow-gold/20 text-sparrow-gold' },
  carried_over: { label: 'On File',   chip: 'bg-sparrow-mist text-sparrow-gray' },
  not_filed:    { label: 'Not Filed', chip: 'bg-sparrow-rule text-sparrow-gray' },
};

export const CONSUMABLES_CATEGORIES = [
  'General Office Supplies',
  'Maintenance Supplies',
  'Operating Supplies',
  'Spare Parts',
  'Other Noninventory Supplies',
] as const;

export type ConsumablesCategory = (typeof CONSUMABLES_CATEGORIES)[number];

export const BATCH_CATEGORIES = [
  'Misc office supplies (non-consumable)',
  'Misc small hand tools',
  'Misc kitchen supplies',
  'Misc household decor',
  'Misc holiday / seasonal decor',
  'Misc cleaning equipment (non-consumable)',
  'Misc books',
  "Misc children's books",
  "Misc children's toys",
  "Children's outdoor toys",
] as const;

export type BatchCategory = (typeof BATCH_CATEGORIES)[number];

export const BATCH_CATEGORY_HINTS: Record<string, string> = {
  'Misc office supplies (non-consumable)':
    'Durable supplies — staplers, tape dispensers, calculators. Not paper, ink, or pens (those are consumables).',
  'Misc small hand tools':
    'Non-power tools only — screwdrivers, wrenches, measuring tape, hammers. Any power tool or anything $50+ gets its own line.',
  'Misc kitchen supplies':
    'Spatulas, dish racks, measuring cups, serving utensils, can openers.',
  'Misc household decor':
    'Framed prints, vases, throw pillows, decorative items.',
  'Misc holiday / seasonal decor':
    'Christmas ornaments, wreaths, seasonal decorations.',
  'Misc cleaning equipment (non-consumable)':
    'Mops, brooms, dustpans, buckets. Not cleaning products — those are consumables.',
  'Misc books':
    'General reading books — inexpensive, non-technical. All go in Schedule 5A.',
  "Misc children's books":
    "Children's picture books and early readers.",
  "Misc children's toys":
    'Indoor toys, games, stuffed animals. Each item must be under $50.',
  "Children's outdoor toys":
    'Outdoor play items. Each must be under $50 — ride-ons and larger toys often exceed this; list those individually.',
};

export const BATCH_TALLY_SCHEDULE: Record<string, InvBentonSchedule> = {
  'Misc small hand tools': 'schedule_5b',
};

export function getBatchSchedule(category: string): InvBentonSchedule {
  return BATCH_TALLY_SCHEDULE[category] ?? 'schedule_5a';
}

// ── Batch tally ───────────────────────────────────────────────────────────

export interface InvBatchTally {
  id: string;
  category: string;
  year: number;
  schedule: InvBentonSchedule;
  filed_value: number | null;
  decision: 'keep' | 'update' | 'assess' | null;
  notes: string | null;
  updated_at: string;
  updated_by: string | null;
}

export type InvItemStatus    = 'active' | 'removed';
export type InvItemCondition = 'new' | 'used';
export type InvCostSource    = 'known' | 'estimated';
export type InvCostBasis     = 'per_item' | 'total';
export type InvSubStatus     = 'draft' | 'submitted' | 'approved';
export type InvExitMethod    = 'thrown_out' | 'hauled_away' | 'sold' | 'donated_picked_up';

export const EXIT_METHOD_LABELS: Record<InvExitMethod, string> = {
  thrown_out:        'Thrown out / disposed',
  hauled_away:       'Hauled away',
  sold:              'Sold',
  donated_picked_up: 'Donated & picked up',
};

export const SUBMISSION_STATUS_META: Record<InvSubStatus, { label: string; chip: string }> = {
  draft:     { label: 'Draft',     chip: 'bg-sparrow-mist text-sparrow-gray' },
  submitted: { label: 'Submitted', chip: 'bg-priority-p3/15 text-priority-p3' },
  approved:  { label: 'Approved',  chip: 'bg-sparrow-green/10 text-sparrow-green' },
};

// ── Entity types ──────────────────────────────────────────────────────────

export interface InvLocation {
  id: string;
  name: string;
  sort_order: number;
  is_remote: boolean;
  is_lcp_house: boolean;
}

export interface InvSubLocation {
  id: string;
  location_id: string;
  name: string;
  sort_order: number;
}

export interface InvItem {
  id: string;
  location_id: string;
  sub_location_id: string | null;
  description: string;
  serial_number: string | null;
  is_batch: boolean;
  batch_category: string | null;
  condition: InvItemCondition;
  is_donated: boolean;
  quantity: number;
  unit_cost: number;
  cost_source: InvCostSource;
  status: InvItemStatus;
  acquired_date: string | null;
  removed_date: string | null;
  notes: string | null;
  benton_schedule: InvBentonSchedule;
  filing_status: InvFilingStatus;
  filed_as: string | null;
  who_has_it: string | null;
  review_flag: string | null;
  created_at: string;
  updated_at: string;
  sub_location?: InvSubLocation;
}

export interface InvConsumablesSnapshot {
  id: string;
  year: number;
  category: string;
  amount: number;
  notes: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface InvMonthlySubmission {
  id: string;
  location_id: string;
  period_month: number;
  period_year: number;
  submitted_by: string | null;
  submitted_at: string | null;
  status: InvSubStatus;
  nothing_came_in: boolean;
  nothing_left: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  location?: InvLocation;
  submitter?: { id: string; full_name: string };
  additions?: InvAddition[];
  removals?: InvRemoval[];
  comments?: InvComment[];
}

export interface InvAddition {
  id: string;
  submission_id: string;
  description: string;
  serial_number: string | null;
  is_batch: boolean;
  batch_category: string | null;
  condition: InvItemCondition;
  is_donated: boolean;
  quantity: number;
  cost: number;
  cost_basis: InvCostBasis;
  cost_source: InvCostSource;
  sub_location_id: string | null;
  notes: string | null;
  ops_edited: boolean;
  inv_item_id: string | null;
  created_at: string;
  updated_at: string;
  sub_location?: InvSubLocation;
}

export interface InvRemoval {
  id: string;
  submission_id: string;
  inv_item_id: string | null;
  description: string;
  serial_number: string | null;
  quantity_removed: number;
  how_it_left: InvExitMethod;
  notes: string | null;
  ops_edited: boolean;
  created_at: string;
  updated_at: string;
  item?: Pick<InvItem, 'id' | 'description' | 'quantity' | 'unit_cost' | 'serial_number'>;
}

export interface InvComment {
  id: string;
  submission_id: string;
  addition_id: string | null;
  removal_id: string | null;
  author_id: string;
  body: string;
  created_at: string;
  author?: { id: string; full_name: string };
}

// ── Display helpers ───────────────────────────────────────────────────────

export function monthName(month: number): string {
  return new Date(2000, month - 1, 1).toLocaleString('default', { month: 'long' });
}

export function formatCost(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function displayAdditionCost(entry: Pick<InvAddition, 'cost' | 'cost_basis' | 'quantity'>): string {
  if (entry.cost_basis === 'per_item' && entry.quantity > 1)
    return `${formatCost(entry.cost)} × ${entry.quantity} = ${formatCost(entry.cost * entry.quantity)}`;
  if (entry.cost_basis === 'total' && entry.quantity > 1)
    return `${formatCost(entry.cost)} total (${entry.quantity} items)`;
  return formatCost(entry.cost);
}

// ── Validation helpers ────────────────────────────────────────────────────

export function isSectionAResolved(
  sub: Pick<InvMonthlySubmission, 'nothing_came_in' | 'additions'>,
): boolean {
  return sub.nothing_came_in || (sub.additions ?? []).length > 0;
}

export function isSectionBResolved(
  sub: Pick<InvMonthlySubmission, 'nothing_left' | 'removals'>,
): boolean {
  return sub.nothing_left || (sub.removals ?? []).length > 0;
}

export function canSubmitForReview(
  sub: Pick<InvMonthlySubmission, 'nothing_came_in' | 'nothing_left' | 'additions' | 'removals'>,
): boolean {
  return isSectionAResolved(sub) && isSectionBResolved(sub);
}

// ── House Flip types ──────────────────────────────────────────────────────

export type InvFlipStatus =
  | 'walkthrough'
  | 'leave_behinds'
  | 'pending_shelly'
  | 'purchasing'
  | 'new_items'
  | 'submitted';

export const FLIP_STATUS_LABELS: Record<InvFlipStatus, string> = {
  walkthrough:    'Walkthrough in progress',
  leave_behinds:  'Logging leave-behinds',
  pending_shelly: 'Awaiting supervisor approval',
  purchasing:     'Purchasing',
  new_items:      'Logging new items',
  submitted:      'Complete',
};

export interface InvHouseFlip {
  id: string;
  location_id: string;
  initiated_by: string;
  status: InvFlipStatus;
  shelly_approved_by: string | null;
  shelly_approved_at: string | null;
  shelly_notes: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  location?: InvLocation;
  initiator?: { id: string; full_name: string };
}

export interface InvFlipItemCheck {
  id: string;
  flip_id: string;
  item_id: string;
  checked_present: boolean;
  confirmed_missing: boolean;
  notes: string | null;
  created_at: string;
  item?: InvItem;
}

export interface InvFlipLeaveBehind {
  id: string;
  flip_id: string;
  description: string;
  condition: string;
  estimated_value: number | null;
  sub_location_id: string | null;
  keeping: boolean;
  notes: string | null;
  created_at: string;
  sub_location?: InvSubLocation;
}

export interface InvFlipNewItem {
  id: string;
  flip_id: string;
  description: string;
  serial_number: string | null;
  is_batch: boolean;
  batch_category: string | null;
  condition: string;
  is_donated: boolean;
  quantity: number;
  cost: number;
  cost_basis: InvCostBasis;
  cost_source: InvCostSource;
  sub_location_id: string | null;
  notes: string | null;
  inv_item_id: string | null;
  created_at: string;
  sub_location?: InvSubLocation;
}
