export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentStatus = 'open' | 'resolved';

export const INCIDENT_TYPES = [
  'Noise / disturbance',
  'Property damage',
  'Trespassing',
  'Utilities issue',
  'Safety hazard',
  'Lease violation',
  'Other',
] as const;

export const INCIDENT_SEVERITIES: {
  value: IncidentSeverity;
  label: string;
  dot: string;
  badge: string;
}[] = [
  { value: 'low', label: 'Low', dot: 'bg-emerald-400', badge: 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-500/30' },
  { value: 'medium', label: 'Medium', dot: 'bg-amber-400', badge: 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-200 dark:ring-amber-500/30' },
  { value: 'high', label: 'High', dot: 'bg-orange-400', badge: 'bg-orange-50 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300 ring-orange-200 dark:ring-orange-500/30' },
  { value: 'critical', label: 'Critical', dot: 'bg-red-500', badge: 'bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 ring-red-200 dark:ring-red-500/30' },
];

export interface Incident {
  id: string;
  incident_date: string;
  lot_id: string | null;
  lot_label: string | null;
  incident_type: string;
  severity: IncidentSeverity;
  description: string;
  logged_by: string;
  follow_up: string | null;
  status: IncidentStatus;
  created_at: string;
  updated_at: string;
}

export interface IncidentWithLogger extends Incident {
  logger: { id: string; full_name: string } | null;
}
