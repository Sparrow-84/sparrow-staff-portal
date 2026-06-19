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
  { value: 'low', label: 'Low', dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  { value: 'medium', label: 'Medium', dot: 'bg-amber-400', badge: 'bg-amber-50 text-amber-700 ring-amber-200' },
  { value: 'high', label: 'High', dot: 'bg-orange-400', badge: 'bg-orange-50 text-orange-700 ring-orange-200' },
  { value: 'critical', label: 'Critical', dot: 'bg-red-500', badge: 'bg-red-50 text-red-700 ring-red-200' },
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
