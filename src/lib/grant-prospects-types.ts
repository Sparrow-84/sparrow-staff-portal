// Grant Prospects pipeline — leads before they're real grants. Mirrors
// supabase/migrations/0137_grant_prospects.sql. Same ops_access gate as the rest of
// the Grants module (Andrew, Susanna, Shelly).

export type GrantProspectLabelKind = 'tier' | 'source';

export interface GrantProspectLabel {
  id: string;
  kind: GrantProspectLabelKind;
  name: string;
  color: string;
  created_by: string | null;
  created_at: string;
}

export type GrantProspectStatus =
  | 'not_researched'
  | 'researching'
  | 'decided_pursue'
  | 'decided_no'
  | 'applied'
  | 'awarded';

export const PROSPECT_STATUSES: { value: GrantProspectStatus; label: string }[] = [
  { value: 'not_researched', label: 'Not researched' },
  { value: 'researching', label: 'Researching' },
  { value: 'decided_pursue', label: 'Decided — Pursue' },
  { value: 'decided_no', label: 'Decided — No' },
  { value: 'applied', label: 'Applied' },
  { value: 'awarded', label: 'Awarded 🎉' },
];

export function prospectStatusLabel(s: GrantProspectStatus): string {
  return PROSPECT_STATUSES.find((x) => x.value === s)?.label ?? s;
}

/** Tailwind chip classes per status — matches the certification/priority chip pattern
 * already used elsewhere in Grants (grants-types.ts's certificationTone). */
export function prospectStatusChip(s: GrantProspectStatus): string {
  switch (s) {
    case 'not_researched':
      return 'bg-sparrow-rule text-sparrow-gray';
    case 'researching':
      return 'bg-blue-100 text-blue-700';
    case 'decided_pursue':
      return 'bg-sparrow-sage text-sparrow-green';
    case 'decided_no':
      return 'bg-sparrow-mist text-sparrow-gray';
    case 'applied':
      return 'bg-amber-100 text-amber-700';
    case 'awarded':
      return 'bg-sparrow-green text-white';
  }
}

/** Statuses still "in motion" — shown in the Being Pursued tab. */
export const PROSPECT_ACTIVE_STATUSES: GrantProspectStatus[] = [
  'not_researched',
  'researching',
  'decided_pursue',
  'applied',
];

export interface GrantProspect {
  id: string;
  name: string;
  tier_label_id: string | null;
  source_label_id: string | null;
  status: GrantProspectStatus;
  application_opens: string | null;
  application_deadline: string | null;
  est_amount: number | null;
  findings: string | null;
  decision_reasoning: string | null;
  action_steps: string | null;
  converted_grant_id: string | null;
  owner_id: string | null;
  lead_time_days: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface GrantProspectLink {
  id: string;
  prospect_id: string;
  label: string;
  url: string;
  created_by: string | null;
  created_at: string;
}

export interface GrantProspectDocument {
  id: string;
  prospect_id: string;
  label: string;
  storage_path: string;
  summary: string | null;
  created_by: string | null;
  created_at: string;
}
