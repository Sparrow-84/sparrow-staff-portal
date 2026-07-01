// Org-wide reference document library (System 2 — staff portal).
// All staff can read; ops tier manages content.

export interface OrgDocument {
  id: string;
  title: string;
  category: string;
  description: string | null;
  url: string | null;
  sort_order: number;
  created_at: string;
}

export const DOCUMENT_CATEGORIES: string[] = [
  'Handbooks',
  'Policies',
  'Emergency',
  'Forms',
  'Resources',
  'Staff Roles',
];
