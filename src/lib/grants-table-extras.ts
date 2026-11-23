import { supabase } from './supabase';
import type { GrantNotificationCategory } from './grants-types';

// Per-row roll-ups of a grant's/prospect's child records (contacts, links, documents,
// updates, funder notices) so the Grants tables can offer a column for everything the
// detail panel shows. One light query per child table, not one per row.

export interface GrantRowExtras {
  contacts: string[];
  linkCount: number;
  docCount: number;
  latestUpdate: { body: string; created_at: string } | null;
  latestNotice: { category: GrantNotificationCategory; sent_on: string } | null;
}

export const EMPTY_EXTRAS: GrantRowExtras = { contacts: [], linkCount: 0, docCount: 0, latestUpdate: null, latestNotice: null };

async function rows<T>(table: string, cols: string): Promise<T[]> {
  const { data, error } = await supabase.from(table).select(cols);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as T[];
}

function entry(map: Map<string, GrantRowExtras>, id: string): GrantRowExtras {
  let e = map.get(id);
  if (!e) {
    e = { contacts: [], linkCount: 0, docCount: 0, latestUpdate: null, latestNotice: null };
    map.set(id, e);
  }
  return e;
}

function collect(
  contacts: { pid: string; name: string }[],
  links: { pid: string }[],
  docs: { pid: string }[],
  updates: { pid: string; body: string; created_at: string }[],
  notices: { pid: string; category: GrantNotificationCategory; sent_on: string }[] = [],
): Map<string, GrantRowExtras> {
  const map = new Map<string, GrantRowExtras>();
  for (const c of contacts) entry(map, c.pid).contacts.push(c.name);
  for (const l of links) entry(map, l.pid).linkCount++;
  for (const d of docs) entry(map, d.pid).docCount++;
  for (const u of updates) {
    const e = entry(map, u.pid);
    if (!e.latestUpdate || u.created_at > e.latestUpdate.created_at) e.latestUpdate = { body: u.body, created_at: u.created_at };
  }
  for (const n of notices) {
    const e = entry(map, n.pid);
    if (!e.latestNotice || n.sent_on > e.latestNotice.sent_on) e.latestNotice = { category: n.category, sent_on: n.sent_on };
  }
  return map;
}

export async function fetchProspectTableExtras(): Promise<Map<string, GrantRowExtras>> {
  const [c, l, d, u] = await Promise.all([
    rows<{ prospect_id: string; name: string }>('grant_prospect_contacts', 'prospect_id,name'),
    rows<{ prospect_id: string }>('grant_prospect_links', 'prospect_id'),
    rows<{ prospect_id: string }>('grant_prospect_documents', 'prospect_id'),
    rows<{ prospect_id: string; body: string; created_at: string }>('grant_prospect_updates', 'prospect_id,body,created_at'),
  ]);
  return collect(
    c.map((x) => ({ pid: x.prospect_id, name: x.name })),
    l.map((x) => ({ pid: x.prospect_id })),
    d.map((x) => ({ pid: x.prospect_id })),
    u.map((x) => ({ pid: x.prospect_id, body: x.body, created_at: x.created_at })),
  );
}

export async function fetchGrantTableExtras(): Promise<Map<string, GrantRowExtras>> {
  const [c, l, d, u, n] = await Promise.all([
    rows<{ grant_id: string; name: string }>('grant_contacts', 'grant_id,name'),
    rows<{ grant_id: string }>('grant_links', 'grant_id'),
    rows<{ grant_id: string }>('grant_documents', 'grant_id'),
    rows<{ grant_id: string; body: string; created_at: string }>('grant_updates', 'grant_id,body,created_at'),
    rows<{ grant_id: string; category: GrantNotificationCategory; sent_on: string }>('grant_notifications', 'grant_id,category,sent_on'),
  ]);
  return collect(
    c.map((x) => ({ pid: x.grant_id, name: x.name })),
    l.map((x) => ({ pid: x.grant_id })),
    d.map((x) => ({ pid: x.grant_id })),
    u.map((x) => ({ pid: x.grant_id, body: x.body, created_at: x.created_at })),
    n.map((x) => ({ pid: x.grant_id, category: x.category, sent_on: x.sent_on })),
  );
}
